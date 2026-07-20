/**
 * Sessão viva do treinador de check-in — implementação CDP puro.
 *
 * NOTA IMPORTANTE: puppeteer-core não roda no Cloudflare Workers
 * (usa `net.createConnection` do Node). Aqui falamos o Chrome DevTools
 * Protocol direto via WebSocket de saída, que o runtime do Worker suporta.
 *
 * Abre a LATAM UMA vez no Browserless via stealth+reconnect e guarda
 * o `browserWSEndpoint` num Map em memória. Cada ação reconecta, envia
 * comandos CDP na MESMA aba e devolve o print.
 */

import { randomUUID } from "crypto";

const BROWSERLESS_BASE = "https://production-sfo.browserless.io";
// Plano Free limita reconnect a 10s. O front bate heartbeat a cada 6s.
const SESSION_RECONNECT_MS = 9 * 1000;
const SESSION_INACTIVITY_MS = 10 * 60 * 1000;
const OPEN_REQUEST_TIMEOUT_MS = 70 * 1000;

export type LiveStep =
  | { action: "goto"; url: string }
  | { action: "wait"; ms: number }
  | { action: "click"; x: number; y: number }
  | { action: "type"; x: number; y: number; text: string; clearFirst?: boolean }
  | { action: "press"; key: string }
  | { action: "scroll"; dy: number }
  | { action: "back" };

interface StoredSession {
  id: string;
  userId: string;
  wsEndpoint: string;
  initialUrl: string;
  createdAt: number;
  lastUsed: number;
  viewport: { width: number; height: number };
}

const g = globalThis as unknown as { __viaTrainingSessions?: Map<string, StoredSession> };
if (!g.__viaTrainingSessions) g.__viaTrainingSessions = new Map();
const sessions = g.__viaTrainingSessions;

export class SessionExpiredError extends Error {
  code = "SESSION_EXPIRED" as const;
  constructor(msg = "Sessão expirou — abra novamente") {
    super(msg);
  }
}

function cleanup() {
  const now = Date.now();
  for (const [id, s] of sessions.entries()) {
    if (now - s.lastUsed > SESSION_INACTIVITY_MS) sessions.delete(id);
  }
}

function requireSession(sessionId: string, userId: string): StoredSession {
  const s = sessions.get(sessionId);
  if (!s || s.userId !== userId) throw new SessionExpiredError();
  if (Date.now() - s.lastUsed > SESSION_INACTIVITY_MS) {
    sessions.delete(sessionId);
    throw new SessionExpiredError();
  }
  return s;
}

// ============================================================
// Minimal CDP client sobre WebSocket nativo do Worker.
// ============================================================

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
}

// Interface mínima comum ao WebSocket de saída do runtime e ao navegador.
type WorkerWebSocket = {
  readyState: number;
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
  addEventListener: (ev: string, cb: (ev: { data?: unknown; code?: number; reason?: string }) => void) => void;
};

class CdpClient {
  private ws: WorkerWebSocket;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private eventHandlers = new Map<string, Set<(params: unknown) => void>>();
  private closed = false;
  sessionId?: string; // page session
  targetId?: string;

  on(method: string, cb: (params: unknown) => void): () => void {
    let set = this.eventHandlers.get(method);
    if (!set) { set = new Set(); this.eventHandlers.set(method, set); }
    set.add(cb);
    return () => { set!.delete(cb); };
  }


  private constructor(ws: WorkerWebSocket) {
    this.ws = ws;
  }

  static async connect(wsUrl: string, timeoutMs = 20_000): Promise<CdpClient> {
    // Não use fetch({ Upgrade: "websocket" }) aqui: na camada serverless ele
    // pode ser tratado como um fetch HTTP comum e falhar antes do handshake.
    // O construtor WebSocket abre diretamente o endpoint wss:// retornado pela
    // Browserless e já vem aceito para conexões de saída.
    const WebSocketCtor = globalThis.WebSocket;
    if (typeof WebSocketCtor !== "function") {
      throw new Error("WebSocket de saída indisponível neste ambiente");
    }
    const ws = new WebSocketCtor(wsUrl) as unknown as WorkerWebSocket;
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
      ws.addEventListener("close", (event) => {
        clearTimeout(timer);
        reject(
          new Error(
            `WebSocket remoto fechou durante a conexão (código ${event.code ?? "indisponível"}${event.reason ? `: ${event.reason}` : ""})`,
          ),
        );
      });
    });
    const client = new CdpClient(ws);
    ws.addEventListener("message", (ev) => client.onMessage(typeof ev.data === "string" ? ev.data : ""));
    ws.addEventListener("close", () => {
      client.closed = true;
      for (const p of client.pending.values()) p.reject(new Error("WebSocket fechado"));
      client.pending.clear();
    });
    ws.addEventListener("error", () => {
      client.closed = true;
    });
    return client;
  }

  private onMessage(data: string) {
    if (!data) return;
    let msg: { id?: number; result?: unknown; error?: { message?: string }; method?: string };
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
      const set = this.eventHandlers.get(msg.method);
      if (set) for (const cb of set) { try { cb((msg as unknown as { params?: unknown }).params); } catch { /* ignore */ } }
    }
    // eventos não usados por enquanto
  }

  async send<T = unknown>(method: string, params: Record<string, unknown> = {}, sessionId?: string | null): Promise<T> {
    if (this.closed) throw new Error("CDP fechado");
    const id = this.nextId++;
    const msg: Record<string, unknown> = { id, method, params };
    // `null` força comando no navegador; `undefined` usa a sessão da aba.
    const sid = sessionId === null ? undefined : sessionId ?? this.sessionId;
    if (sid) msg.sessionId = sid;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      try {
        this.ws.send(JSON.stringify(msg));
      } catch (e) {
        this.pending.delete(id);
        reject(e instanceof Error ? e : new Error(String(e)));
      }
      // timeout defensivo
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 30_000);
    });
  }

  async attachToPage(): Promise<void> {
    // 1) Lista targets no browser
    const listed = await this.send<{ targetInfos: Array<{ targetId: string; type: string; url: string }> }>(
      "Target.getTargets",
      {},
      undefined,
    );
    let page = listed.targetInfos.find(
      (t) => t.type === "page" && t.url.includes("latamairlines.com"),
    );
    if (!page) page = listed.targetInfos.find((t) => t.type === "page");
    if (!page) throw new Error("Nenhuma aba encontrada no navegador remoto");
    this.targetId = page.targetId;
    const attached = await this.send<{ sessionId: string }>(
      "Target.attachToTarget",
      { targetId: page.targetId, flatten: true },
      undefined,
    );
    this.sessionId = attached.sessionId;
    // habilita domínios necessários
    await this.send("Page.enable").catch(() => {});
    await this.send("Runtime.enable").catch(() => {});
    await this.send("DOM.enable").catch(() => {});
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

// ============================================================
// Helpers de alto nível sobre CDP
// ============================================================

async function evalExpr<T>(cdp: CdpClient, expression: string): Promise<T | null> {
  const res = await cdp
    .send<{ result?: { value?: T } }>("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    .catch(() => null);
  return res?.result?.value ?? null;
}

type RenderState = {
  href: string;
  title: string;
  readyState: string;
  bodyHtmlLength: number;
  elementCount: number;
  visibleElementCount: number;
  bodyWidth: number;
  bodyHeight: number;
};

async function readRenderState(cdp: CdpClient): Promise<RenderState | null> {
  return evalExpr<RenderState>(
    cdp,
    `(() => ({
      href: location.href,
      title: document.title || '',
      readyState: document.readyState,
      bodyHtmlLength: document.body?.innerHTML?.length || 0,
      elementCount: document.body?.getElementsByTagName('*')?.length || 0,
      visibleElementCount: Array.from(document.body?.querySelectorAll('*') || []).slice(0, 500).filter((el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 2 && r.height > 2 && s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity || 1) > 0;
      }).length,
      bodyWidth: document.body?.getBoundingClientRect().width || 0,
      bodyHeight: document.body?.getBoundingClientRect().height || 0
    }))()`,
  );
}

async function waitForRenderablePage(cdp: CdpClient, fallbackUrl?: string) {
  const waitUntilReady = async (timeoutMs: number) => {
    const started = Date.now();
    let state: RenderState | null = null;
    while (Date.now() - started < timeoutMs) {
      state = await readRenderState(cdp);
      if (
        state &&
        state.href !== "about:blank" &&
        state.readyState !== "loading" &&
        state.bodyHtmlLength > 300 &&
        state.elementCount > 3 &&
        state.visibleElementCount > 2 &&
        state.bodyWidth > 100 &&
        state.bodyHeight > 100
      ) {
        await evalExpr(
          cdp,
          "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
        );
        return state;
      }
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
    return state;
  };

  let state = await waitUntilReady(8_000);
  if (
    fallbackUrl &&
    (!state || state.href === "about:blank" || state.bodyHtmlLength <= 300 || state.elementCount <= 3 || state.visibleElementCount <= 2)
  ) {
    await cdp.send("Page.navigate", { url: fallbackUrl });
    state = await waitUntilReady(12_000);
  }
  if (!state || state.href === "about:blank" || state.bodyHtmlLength <= 300 || state.elementCount <= 3 || state.visibleElementCount <= 2) {
    throw new Error(
      `LATAM_EMPTY_PAGE: url=${state?.href || "indisponível"}; estado=${state?.readyState || "indisponível"}`,
    );
  }
}

async function waitForSpinnerGone(cdp: CdpClient, timeoutMs = 20_000) {
  const started = Date.now();
  const pattern = "estamos procurando|aguarde|carregando|processando|loading|please wait|um momento";
  while (Date.now() - started < timeoutMs) {
    const stillLoading = await evalExpr<boolean>(
      cdp,
      `(() => {
        const t = (document.body?.innerText || '').toLowerCase();
        if (new RegExp(${JSON.stringify(pattern)}).test(t)) return true;
        // spinner visível (ícones/circulares comuns)
        const spin = document.querySelector('[class*="spinner" i],[class*="loader" i],[class*="loading" i],[role="progressbar"]');
        if (spin) {
          const r = spin.getBoundingClientRect();
          if (r.width > 8 && r.height > 8) return true;
        }
        return false;
      })()`,
    );
    if (!stillLoading) return;
    await new Promise((r) => setTimeout(r, 400));
  }
}

async function capture(cdp: CdpClient, fallbackUrl?: string) {
  await waitForRenderablePage(cdp, fallbackUrl);
  await waitForSpinnerGone(cdp);
  await cdp.send("Page.bringToFront").catch(() => {});
  await evalExpr(cdp, "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  let shot = await cdp.send<{ data: string }>("Page.captureScreenshot", {
    format: "jpeg", quality: 60, fromSurface: true, captureBeyondViewport: false,
  });
  // Em algumas reconexões o compositor remoto devolve apenas um quadro branco
  // apesar de o DOM estar pronto. Uma imagem JPEG 1280x900 quase vazia fica
  // anormalmente pequena; nesse caso capturamos pelo viewport da própria página.
  if (shot.data.length < 18_000) {
    await new Promise((resolve) => setTimeout(resolve, 700));
    shot = await cdp.send<{ data: string }>("Page.captureScreenshot", {
      format: "jpeg", quality: 70, fromSurface: false, captureBeyondViewport: false,
    });
  }
  if (shot.data.length < 18_000) {
    throw new Error("LATAM_EMPTY_FRAME: a página está carregada, mas o navegador remoto não pintou a imagem");
  }
  const currentUrl = (await evalExpr<string>(cdp, "location.href")) || "";
  const title = (await evalExpr<string>(cdp, "document.title")) || "";
  const bodyText = (await evalExpr<string>(cdp, "document.body?.innerText?.slice(0, 800) || ''")) || "";
  if (
    currentUrl.startsWith("chrome-error://") ||
    /ERR_HTTP2_PROTOCOL_ERROR|ERR_QUIC_PROTOCOL_ERROR|ERR_CONNECTION_RESET|This site can.?t be reached/i.test(bodyText)
  ) {
    throw new Error(`LATAM_NAVIGATION_BLOCKED: ${bodyText.slice(0, 200)}`);
  }
  return { screenshot: shot.data, currentUrl, title };
}

async function mouseClick(cdp: CdpClient, x: number, y: number) {
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
}

function typingPause(minMs = 90, maxMs = 190) {
  const ms = Math.round(minMs + Math.random() * (maxMs - minMs));
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function keyboardCodeFor(char: string) {
  if (/^[a-z]$/i.test(char)) return `Key${char.toUpperCase()}`;
  if (/^[0-9]$/.test(char)) return `Digit${char}`;
  if (char === " ") return "Space";
  return "";
}

async function typeText(cdp: CdpClient, text: string) {
  // Envia uma tecla por vez. `Input.insertText` injeta a string completa num
  // único evento e não aciona da mesma forma as validações React/Angular da página.
  for (const char of text) {
    const upperCase = /^[A-Z]$/.test(char);
    const keyCode = char.toUpperCase().charCodeAt(0);
    const common = {
      key: char,
      code: keyboardCodeFor(char),
      windowsVirtualKeyCode: keyCode,
      nativeVirtualKeyCode: keyCode,
      modifiers: upperCase ? 8 : 0,
    };
    await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...common });
    await cdp.send("Input.dispatchKeyEvent", {
      type: "char",
      ...common,
      text: char,
      unmodifiedText: char,
    });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...common });
    await typingPause();
  }
}

async function clearFocusedField(cdp: CdpClient) {
  const selectAll = { key: "a", code: "KeyA", windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 65, modifiers: 2 };
  await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...selectAll });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...selectAll });
  await typingPause(60, 110);
  await pressKey(cdp, "Backspace");
}

async function pressKey(cdp: CdpClient, key: string) {
  // Mapeamento mínimo — chaves comuns: Enter, Tab, Backspace, Escape
  const map: Record<string, { code: string; windowsVirtualKeyCode: number; text?: string }> = {
    Enter: { code: "Enter", windowsVirtualKeyCode: 13, text: "\r" },
    Tab: { code: "Tab", windowsVirtualKeyCode: 9 },
    Backspace: { code: "Backspace", windowsVirtualKeyCode: 8 },
    Escape: { code: "Escape", windowsVirtualKeyCode: 27 },
    ArrowDown: { code: "ArrowDown", windowsVirtualKeyCode: 40 },
    ArrowUp: { code: "ArrowUp", windowsVirtualKeyCode: 38 },
  };
  const k = map[key] ?? { code: key, windowsVirtualKeyCode: 0 };
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key, ...k });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key, ...k });
}

async function withConnection<T>(
  session: StoredSession,
  fn: (cdp: CdpClient) => Promise<T>,
): Promise<T> {
  let cdp: CdpClient;
  try {
    cdp = await CdpClient.connect(session.wsEndpoint);
  } catch (e) {
    sessions.delete(session.id);
    throw new SessionExpiredError(
      `Sessão do navegador remoto encerrada: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  try {
    await cdp.attachToPage();

    const result = await fn(cdp);

    // Renova reconnect antes de fechar — o timer do Browserless conta do
    // momento da última chamada `Browserless.reconnect`, não da conexão.
    try {
      const renewed = await cdp.send<{ browserWSEndpoint?: string }>(
        "Browserless.reconnect",
        { timeout: SESSION_RECONNECT_MS },
        null,
      );
      if (renewed.browserWSEndpoint) {
        const token = process.env.BROWSERLESS_TOKEN;
        const ws = new URL(renewed.browserWSEndpoint);
        if (token && !ws.searchParams.has("token")) ws.searchParams.set("token", token);
        session.wsEndpoint = ws.toString();
      }
    } catch (error) {
      sessions.delete(session.id);
      throw new SessionExpiredError(
        `Não foi possível renovar a sessão remota: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    session.lastUsed = Date.now();
    return result;
  } finally {
    cdp.close();
  }
}

// ============================================================
// API pública (mesma assinatura de antes)
// ============================================================

export interface OpenSessionOpts {
  userId: string;
  url: string;
  viewportWidth: number;
  viewportHeight: number;
  useResidentialProxy?: boolean;
}

export async function openLiveSession(opts: OpenSessionOpts) {
  cleanup();

  for (const [id, s] of sessions.entries()) {
    if (s.userId === opts.userId) {
      sessions.delete(id);
      closeRemote(s.wsEndpoint).catch(() => {});
    }
  }

  const token = process.env.BROWSERLESS_TOKEN;
  if (!token) throw new Error("BROWSERLESS_TOKEN não configurado");

  const params = new URLSearchParams({
    token,
    timeout: String(OPEN_REQUEST_TIMEOUT_MS),
    humanlike: "true",
    blockAds: "true",
  });
  if (opts.useResidentialProxy) {
    params.set("proxy", "residential");
    params.set("proxyCountry", "br");
    params.set("proxySticky", "true");
    params.set("proxyLocaleMatch", "true");
  }
  const endpoint = `${BROWSERLESS_BASE}/stealth/bql?${params.toString()}`;

  const query = `
    mutation OpenLive($url: String!) {
      viewport(
        width: ${opts.viewportWidth}
        height: ${opts.viewportHeight}
        deviceScaleFactor: 1
        mobile: false
      ) { width height }
      goto(url: $url, waitUntil: domContentLoaded, timeout: 35000) { status }
      reconnect(timeout: ${SESSION_RECONNECT_MS}) { browserWSEndpoint }
    }
  `;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPEN_REQUEST_TIMEOUT_MS + 2_000);
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables: { url: opts.url } }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Browserless HTTP ${response.status}: ${body.slice(0, 2000)}`);
  }
  const payload = JSON.parse(body) as {
    data?: { reconnect?: { browserWSEndpoint?: string } };
    errors?: Array<{ message?: string }>;
  };
  const raw = payload.data?.reconnect?.browserWSEndpoint;
  if (!raw) {
    const detail = payload.errors?.map((e) => e.message).filter(Boolean).join("; ") || body;
    throw new Error(`Browserless não devolveu sessão: ${detail.slice(0, 1000)}`);
  }
  const ws = new URL(raw);
  if (!ws.searchParams.has("token")) ws.searchParams.set("token", token);
  const wsEndpoint = ws.toString();

  const session: StoredSession = {
    id: randomUUID(),
    userId: opts.userId,
    wsEndpoint,
    initialUrl: opts.url,
    createdAt: Date.now(),
    lastUsed: Date.now(),
    viewport: { width: opts.viewportWidth, height: opts.viewportHeight },
  };
  sessions.set(session.id, session);

  let shot: Awaited<ReturnType<typeof capture>>;
  try {
    shot = await withConnection(session, (cdp) => capture(cdp, session.initialUrl));
  } catch (error) {
    sessions.delete(session.id);
    await closeRemote(session.wsEndpoint).catch(() => {});
    throw error;
  }
  return {
    sessionId: session.id,
    ...shot,
    width: opts.viewportWidth,
    height: opts.viewportHeight,
  };
}

export async function runLiveStep(opts: {
  userId: string;
  sessionId: string;
  step: LiveStep;
}) {
  const session = requireSession(opts.sessionId, opts.userId);
  return withConnection(session, async (cdp) => {
    const s = opts.step;
    if (s.action === "goto") {
      await cdp.send("Page.navigate", { url: s.url });
      await new Promise((r) => setTimeout(r, 1500));
    } else if (s.action === "wait") {
      await new Promise((r) => setTimeout(r, s.ms));
    } else if (s.action === "click") {
      const urlBefore = (await evalExpr<string>(cdp, "location.href")) || "";
      const domBefore = (await evalExpr<string>(cdp, "document.body?.innerText?.slice(0,400) || ''")) || "";
      await mouseClick(cdp, s.x, s.y);
      const start = Date.now();
      let changed = false;
      while (Date.now() - start < 20_000) {
        await new Promise((r) => setTimeout(r, 300));
        const urlNow = (await evalExpr<string>(cdp, "location.href")) || "";
        const domNow = (await evalExpr<string>(cdp, "document.body?.innerText?.slice(0,400) || ''")) || "";
        if (urlNow !== urlBefore || domNow !== domBefore) { changed = true; break; }
      }
      // depois que algo mudou, espera o spinner sumir também
      if (changed) await waitForSpinnerGone(cdp, 25_000);
      await new Promise((r) => setTimeout(r, 400));
    } else if (s.action === "type") {
      await mouseClick(cdp, s.x, s.y);
      await typingPause(220, 420);
      if (s.clearFirst) {
        await clearFocusedField(cdp);
      }
      await typeText(cdp, s.text);
      // Dá tempo para validação/máscara do campo terminar antes do print ou clique seguinte.
      await typingPause(350, 650);
    } else if (s.action === "press") {
      await pressKey(cdp, s.key);
      await new Promise((r) => setTimeout(r, 500));
    } else if (s.action === "scroll") {
      await evalExpr(cdp, `window.scrollBy(0, ${s.dy})`);
      await new Promise((r) => setTimeout(r, 400));
    } else if (s.action === "back") {
      await evalExpr(cdp, "history.back()");
      await new Promise((r) => setTimeout(r, 800));
    }
    return capture(cdp, session.initialUrl);
  });
}

export async function screenshotLiveSession(opts: { userId: string; sessionId: string }) {
  const session = requireSession(opts.sessionId, opts.userId);
  return withConnection(session, (cdp) => capture(cdp, session.initialUrl));
}

export async function heartbeatLiveSession(opts: { userId: string; sessionId: string }) {
  const session = requireSession(opts.sessionId, opts.userId);
  await withConnection(session, async () => undefined);
  return { alive: true as const };
}

export async function closeLiveSession(opts: { userId: string; sessionId: string }) {
  const session = sessions.get(opts.sessionId);
  if (!session || session.userId !== opts.userId) return { ok: true };
  sessions.delete(opts.sessionId);
  await closeRemote(session.wsEndpoint).catch(() => {});
  return { ok: true };
}

/**
 * Captura o PDF da página atual usando `Page.printToPDF` do CDP.
 * Não depende de clicar no botão "Baixar PDF" da companhia — imprime
 * o cartão de embarque que já está renderizado na tela.
 */
export async function capturePagePdf(opts: {
  userId: string;
  sessionId: string;
}): Promise<{ pdfBase64: string; sourceUrl: string }> {
  const session = requireSession(opts.sessionId, opts.userId);
  return withConnection(session, async (cdp) => {
    // garante que a página está estável antes de imprimir
    await waitForRenderablePage(cdp, session.initialUrl);
    await waitForSpinnerGone(cdp);
    const res = await cdp.send<{ data: string }>("Page.printToPDF", {
      printBackground: true,
      preferCSSPageSize: true,
      landscape: false,
      paperWidth: 8.27,
      paperHeight: 11.69,
      marginTop: 0.2,
      marginBottom: 0.2,
      marginLeft: 0.2,
      marginRight: 0.2,
      scale: 0.9,
    });
    const sourceUrl = (await evalExpr<string>(cdp, "location.href")) || "";
    return { pdfBase64: res.data, sourceUrl };
  });
}

/**
 * Clica em (x,y) — o botão "Salvar PDF" da companhia — e intercepta a
 * resposta HTTP que carrega o PDF real (via Fetch domain do CDP). Assim
 * salvamos o cartão de embarque original assinado pela companhia, em vez
 * de uma reimpressão do HTML.
 */
export async function captureDownloadedPdfFromClick(opts: {
  userId: string;
  sessionId: string;
  x: number;
  y: number;
  timeoutMs?: number;
}): Promise<{ pdfBase64: string; sourceUrl: string }> {
  const session = requireSession(opts.sessionId, opts.userId);
  const timeout = opts.timeoutMs ?? 45_000;
  return withConnection(session, async (cdp) => {
    // Permite downloads (senão o Chromium bloqueia em modo headless)
    await cdp
      .send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: "/tmp" }, null)
      .catch(() => {});
    await cdp.send("Fetch.enable", { patterns: [{ requestStage: "Response" }] });

    const pdfPromise = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => { off(); reject(new Error("Timeout aguardando PDF do botão Salvar")); }, timeout);
      const off = cdp.on("Fetch.requestPaused", (params) => {
        void (async () => {
          const p = params as {
            requestId: string;
            responseHeaders?: Array<{ name: string; value: string }>;
            responseStatusCode?: number;
            request?: { url?: string };
          };
          try {
            const headers = p.responseHeaders || [];
            const ct = headers.find((h) => h.name.toLowerCase() === "content-type")?.value || "";
            const cd = headers.find((h) => h.name.toLowerCase() === "content-disposition")?.value || "";
            const url = (p.request?.url || "").toLowerCase();
            const looksPdf =
              ct.toLowerCase().includes("pdf") ||
              cd.toLowerCase().includes(".pdf") ||
              url.endsWith(".pdf") ||
              url.includes("boardingpass") ||
              url.includes("boarding-pass");
            if (!p.responseStatusCode || !looksPdf) {
              await cdp.send("Fetch.continueRequest", { requestId: p.requestId }).catch(() => {});
              return;
            }
            const body = await cdp.send<{ body: string; base64Encoded: boolean }>(
              "Fetch.getResponseBody",
              { requestId: p.requestId },
            );
            await cdp.send("Fetch.continueRequest", { requestId: p.requestId }).catch(() => {});
            const b64 = body.base64Encoded ? body.body : Buffer.from(body.body, "utf8").toString("base64");
            clearTimeout(timer);
            off();
            resolve(b64);
          } catch {
            await cdp.send("Fetch.continueRequest", { requestId: p.requestId }).catch(() => {});
          }
        })();
      });
    });

    try {
      await mouseClick(cdp, opts.x, opts.y);
      const pdfBase64 = await pdfPromise;
      const sourceUrl = (await evalExpr<string>(cdp, "location.href")) || "";
      return { pdfBase64, sourceUrl };
    } finally {
      await cdp.send("Fetch.disable").catch(() => {});
    }
  });
}

// Compat: se veio x,y > 0, intercepta o download real; senão printa a página.
export const captureNextPdfFromClick = async (opts: {
  userId: string;
  sessionId: string;
  x?: number;
  y?: number;
  timeoutMs?: number;
}) => {
  if (opts.x && opts.y && opts.x > 0 && opts.y > 0) {
    return captureDownloadedPdfFromClick({
      userId: opts.userId,
      sessionId: opts.sessionId,
      x: opts.x,
      y: opts.y,
      timeoutMs: opts.timeoutMs,
    });
  }
  return capturePagePdf({ userId: opts.userId, sessionId: opts.sessionId });
};

/**
 * Captura apenas uma região da tela como PNG. Útil quando o cartão de
 * embarque aparece dentro de uma área específica e não precisamos da página
 * inteira. Coordenadas são em pixels do viewport da sessão.
 */
export async function captureRegionPng(opts: {
  userId: string;
  sessionId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}): Promise<{ pngBase64: string; sourceUrl: string }> {
  const session = requireSession(opts.sessionId, opts.userId);
  const w = Math.max(10, Math.round(opts.width));
  const h = Math.max(10, Math.round(opts.height));
  const x = Math.max(0, Math.round(opts.x));
  const y = Math.max(0, Math.round(opts.y));
  return withConnection(session, async (cdp) => {
    await waitForRenderablePage(cdp, session.initialUrl);
    await waitForSpinnerGone(cdp);
    const res = await cdp.send<{ data: string }>("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: false,
      clip: { x, y, width: w, height: h, scale: 1 },
    });
    const sourceUrl = (await evalExpr<string>(cdp, "location.href")) || "";
    return { pngBase64: res.data, sourceUrl };
  });
}


async function closeRemote(wsEndpoint: string) {
  // Melhor esforço via CDP: Browser.close
  try {
    const cdp = await CdpClient.connect(wsEndpoint, 5_000);
    await cdp.send("Browser.close", {}, undefined).catch(() => {});
    cdp.close();
  } catch {
    /* ignore */
  }
}
