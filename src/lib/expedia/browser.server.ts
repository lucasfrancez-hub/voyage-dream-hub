/**
 * Cliente CDP mínimo + abertura de navegador remoto (Browserless) para o robô
 * Expedia TAAP.
 *
 * Mesma abordagem já usada no treinador de check-in: puppeteer não roda no
 * runtime serverless, então falamos Chrome DevTools Protocol direto via
 * WebSocket de saída.
 */

const BROWSERLESS_BASE = "https://production-sfo.browserless.io";
const OPEN_REQUEST_TIMEOUT_MS = 70_000;
const BROWSERLESS_RATE_LIMIT_RETRIES = 3;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function retryDelay(response: Response, attempt: number) {
  const retryAfter = Number(response.headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(retryAfter * 1_000, 30_000);
  return Math.min(2_000 * 2 ** attempt, 12_000) + Math.floor(Math.random() * 750);
}

type WorkerWebSocket = {
  readyState: number;
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
  addEventListener: (ev: string, cb: (ev: { data?: unknown; code?: number; reason?: string }) => void) => void;
};

export class ExpediaCdp {
  private ws: WorkerWebSocket;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private handlers = new Map<string, Set<(params: unknown) => void>>();
  private closed = false;
  sessionId?: string;

  private constructor(ws: WorkerWebSocket) {
    this.ws = ws;
  }

  static async connect(wsUrl: string, timeoutMs = 20_000): Promise<ExpediaCdp> {
    const Ctor = globalThis.WebSocket;
    if (typeof Ctor !== "function") throw new Error("WebSocket de saída indisponível neste ambiente");
    const ws = new Ctor(wsUrl) as unknown as WorkerWebSocket;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        try {
          ws.close(1000, "timeout");
        } catch {
          /* ignore */
        }
        reject(new Error(`Timeout ao conectar no navegador remoto (${timeoutMs}ms)`));
      }, timeoutMs);
      ws.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      });
      ws.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error("Falha no handshake WebSocket com o navegador remoto"));
      });
      ws.addEventListener("close", () => {
        clearTimeout(timer);
        reject(new Error("WebSocket remoto fechou durante a conexão"));
      });
    });
    const client = new ExpediaCdp(ws);
    ws.addEventListener("message", (ev) => client.onMessage(typeof ev.data === "string" ? ev.data : ""));
    ws.addEventListener("close", () => {
      client.closed = true;
      for (const p of client.pending.values()) p.reject(new Error("WebSocket fechado"));
      client.pending.clear();
    });
    return client;
  }

  private onMessage(data: string) {
    if (!data) return;
    let msg: { id?: number; result?: unknown; error?: { message?: string }; method?: string; params?: unknown };
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    if (typeof msg.id === "number" && this.pending.has(msg.id)) {
      const p = this.pending.get(msg.id)!;
      this.pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message || "CDP error"));
      else p.resolve(msg.result);
      return;
    }
    if (msg.method) {
      const set = this.handlers.get(msg.method);
      if (set) for (const cb of set) { try { cb(msg.params); } catch { /* ignore */ } }
    }
  }

  on(method: string, cb: (params: unknown) => void): () => void {
    let set = this.handlers.get(method);
    if (!set) { set = new Set(); this.handlers.set(method, set); }
    set.add(cb);
    return () => { set!.delete(cb); };
  }

  async send<T = unknown>(
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string | null,
    timeoutMs = 30_000,
  ): Promise<T> {
    if (this.closed) throw new Error("CDP fechado");
    const id = this.nextId++;
    const sid = sessionId === null ? undefined : sessionId ?? this.sessionId;
    const msg: Record<string, unknown> = { id, method, params };
    if (sid) msg.sessionId = sid;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      try {
        this.ws.send(JSON.stringify(msg));
      } catch (e) {
        this.pending.delete(id);
        reject(e instanceof Error ? e : new Error(String(e)));
        return;
      }
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, timeoutMs);
    });
  }

  async attachToPage(): Promise<void> {
    const listed = await this.send<{ targetInfos: Array<{ targetId: string; type: string; url: string }> }>(
      "Target.getTargets",
      {},
      null,
    );
    const page =
      listed.targetInfos.find((t) => t.type === "page" && t.url.includes("expedia.")) ??
      listed.targetInfos.find((t) => t.type === "page");
    if (!page) throw new Error("Nenhuma aba encontrada no navegador remoto");
    const attached = await this.send<{ sessionId: string }>(
      "Target.attachToTarget",
      { targetId: page.targetId, flatten: true },
      null,
    );
    this.sessionId = attached.sessionId;
    await this.send("Page.enable").catch(() => {});
    await this.send("Runtime.enable").catch(() => {});
  }

  async evaluate<T>(expression: string): Promise<T | null> {
    const res = await this.send<{ result?: { value?: T } }>("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    }).catch(() => null);
    return res?.result?.value ?? null;
  }

  close() {
    try {
      this.ws.close();
    } catch {
      /* ignore */
    }
    this.closed = true;
  }
}

/** Abre uma aba no Browserless e devolve o endpoint para falar CDP nela. */
export async function openRemoteBrowser(opts: {
  url: string;
  reconnectMs?: number;
  viewportWidth?: number;
  viewportHeight?: number;
  residentialProxy?: boolean;
}): Promise<string> {
  const token = process.env["BROWSERLESS_TOKEN"];
  if (!token) throw new Error("BROWSERLESS_TOKEN não configurado");

  const params = new URLSearchParams({
    token,
    timeout: String(OPEN_REQUEST_TIMEOUT_MS),
    humanlike: "true",
    blockAds: "true",
  });
  if (opts.residentialProxy) {
    params.set("proxy", "residential");
    params.set("proxyCountry", "br");
    params.set("proxySticky", "true");
  }

  const requested = opts.reconnectMs ?? 60_000;
  // Planos do Browserless limitam o tempo máximo de reconnect; tentamos degradando.
  const attempts = Array.from(
    new Set([requested, 60_000, 30_000, 15_000, 10_000, 5_000].filter((v) => v <= requested)),
  ).sort((a, b) => b - a);

  let lastError = "";
  for (const reconnectMs of attempts) {
    const query = `
    mutation OpenExpedia($url: String!) {
      viewport(width: ${opts.viewportWidth ?? 1440} height: ${opts.viewportHeight ?? 900} deviceScaleFactor: 1 mobile: false) { width height }
      goto(url: $url, waitUntil: domContentLoaded, timeout: 35000) { status }
      reconnect(timeout: ${reconnectMs}) { browserWSEndpoint }
    }
  `;

    let response: Response | null = null;
    let body = "";
    for (let rateAttempt = 0; rateAttempt <= BROWSERLESS_RATE_LIMIT_RETRIES; rateAttempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), OPEN_REQUEST_TIMEOUT_MS + 2_000);
      try {
        response = await fetch(`${BROWSERLESS_BASE}/stealth/bql?${params.toString()}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, variables: { url: opts.url } }),
          signal: controller.signal,
        });
        body = await response.text();
      } finally {
        clearTimeout(timer);
      }
      if (response.status !== 429 || rateAttempt === BROWSERLESS_RATE_LIMIT_RETRIES) break;
      await wait(retryDelay(response, rateAttempt));
    }
    if (!response) throw new Error("Browserless não respondeu ao abrir o navegador remoto");
    if (!response.ok) {
      lastError = response.status === 429
        ? "Browserless está com todas as sessões ocupadas. Aguarde alguns segundos e tente novamente."
        : `Browserless HTTP ${response.status}: ${body.slice(0, 500)}`;
      if (/reconnect time exceeds/i.test(body)) continue;
      throw new Error(lastError);
    }
    const payload = JSON.parse(body) as {
      data?: { reconnect?: { browserWSEndpoint?: string } };
      errors?: Array<{ message?: string }>;
    };
    const raw = payload.data?.reconnect?.browserWSEndpoint;
    if (!raw) {
      const detail = payload.errors?.map((e) => e.message).filter(Boolean).join("; ") || body;
      lastError = `Browserless não devolveu sessão: ${detail.slice(0, 400)}`;
      if (/reconnect time exceeds/i.test(detail)) continue;
      throw new Error(lastError);
    }
    const ws = new URL(raw);
    if (!ws.searchParams.has("token")) ws.searchParams.set("token", token);
    return ws.toString();
  }

  throw new Error(
    `${lastError || "Browserless não devolveu sessão"} — o plano atual do navegador remoto não permite manter a sessão aberta por esse tempo.`,
  );
}


export async function closeRemoteBrowser(wsEndpoint: string) {
  try {
    const cdp = await ExpediaCdp.connect(wsEndpoint, 5_000);
    await cdp.send("Browser.close", {}, null).catch(() => {});
    cdp.close();
  } catch {
    /* ignore */
  }
}
