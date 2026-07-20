/**
 * Cliente HTTP para Browserless (Chrome remoto).
 * Roda um script Puppeteer dentro do Chrome deles e devolve o resultado.
 * Endpoint: /function — https://docs.browserless.io/HTTP-APIs/function
 */

const BROWSERLESS_BASE = "https://production-sfo.browserless.io";

type ConnectedBrowser = Awaited<ReturnType<typeof import("puppeteer-core")["default"]["connect"]>>;

export interface BrowserlessStealthSession {
  browser: ConnectedBrowser;
  page: Awaited<ReturnType<ConnectedBrowser["newPage"]>>;
}

export interface BrowserlessRunResult<T = unknown> {
  data?: T;
  type?: string;
}

interface BrowserlessRunOptions {
  timeoutMs?: number;
  launch?: {
    headless?: boolean;
    stealth?: boolean;
    args?: string[];
  };
  proxy?: "residential" | "datacenter";
  proxyCountry?: string;
  proxySticky?: boolean;
}

/**
 * Executa uma função JS remota no Chrome do Browserless.
 * O `code` deve exportar `default async ({ page, context }) => { ... return { data: ... } }`.
 */
export async function runBrowserlessFunction<T = unknown>(
  code: string,
  context: Record<string, unknown> = {},
  {
    timeoutMs = 120_000,
    launch,
    proxy,
    proxyCountry,
    proxySticky,
  }: BrowserlessRunOptions = {},
): Promise<BrowserlessRunResult<T>> {
  const token = process.env.BROWSERLESS_TOKEN;
  if (!token) throw new Error("BROWSERLESS_TOKEN não configurado");

  const params = new URLSearchParams({ token, timeout: String(timeoutMs) });
  if (launch) params.set("launch", JSON.stringify(launch));
  if (launch?.stealth != null) params.set("stealth", String(launch.stealth));
  if (proxy) params.set("proxy", proxy);
  if (proxyCountry) params.set("proxyCountry", proxyCountry);
  if (proxySticky != null) params.set("proxySticky", String(proxySticky));
  const url = `${BROWSERLESS_BASE}/function?${params.toString()}`;

  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), timeoutMs + 5_000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, context }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      // A função remota inclui no erro um estado sanitizado da página.
      // Preserve o suficiente para diagnosticar mudanças no fluxo da companhia.
      throw new Error(`Browserless HTTP ${res.status}: ${text.slice(0, 5_000)}`);
    }
    const json = (await res.json()) as BrowserlessRunResult<T>;
    return json;
  } finally {
    clearTimeout(to);
  }
}

/**
 * Abre a página via BrowserQL stealth, resolve desafios detectáveis e entrega
 * a MESMA sessão ao Puppeteer. Isso mantém IP, cookies e fingerprint durante
 * todo o fluxo — essencial em sites que recusam uma nova sessão após o login.
 */
export async function connectBrowserlessStealth(
  url: string,
  timeoutMs = 150_000,
): Promise<BrowserlessStealthSession> {
  const token = process.env.BROWSERLESS_TOKEN;
  if (!token) throw new Error("BROWSERLESS_TOKEN não configurado");

  const params = new URLSearchParams({
    token,
    timeout: String(timeoutMs),
    proxy: "residential",
    proxyCountry: "br",
    proxySticky: "true",
    proxyLocaleMatch: "true",
  });
  const endpoint = `${BROWSERLESS_BASE}/stealth/bql?${params.toString()}`;
  const query = `
    mutation OpenStealth($url: String!) {
      goto(url: $url, waitUntil: domContentLoaded, timeout: 45000) { status }
      solve(timeout: 30000, wait: true) { found solved time }
      reconnect(timeout: 45000) { browserWSEndpoint }
    }
  `;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables: { url } }),
      signal: controller.signal,
    });
    const body = await response.text();
    if (!response.ok) {
      throw new Error(`Browserless stealth HTTP ${response.status}: ${body.slice(0, 2_000)}`);
    }
    const payload = JSON.parse(body) as {
      data?: { reconnect?: { browserWSEndpoint?: string } };
      errors?: Array<{ message?: string }>;
    };
    const browserWSEndpoint = payload.data?.reconnect?.browserWSEndpoint;
    if (!browserWSEndpoint) {
      const detail = payload.errors?.map((item) => item.message).filter(Boolean).join("; ") || body;
      throw new Error(`Browserless stealth não abriu sessão: ${detail.slice(0, 2_000)}`);
    }

    const puppeteer = await import("puppeteer-core");
    const ws = new URL(browserWSEndpoint);
    if (!ws.searchParams.has("token")) ws.searchParams.set("token", token);
    let browser: ConnectedBrowser;
    try {
      browser = await puppeteer.default.connect({ browserWSEndpoint: ws.toString() });
    } catch (error) {
      const detail = error instanceof Error
        ? error.message
        : typeof error === "object" && error
          ? JSON.stringify(error)
          : String(error);
      throw new Error(`Browserless stealth falhou ao conectar: ${detail}`);
    }
    const pages = await browser.pages();
    const page = pages.find((candidate) => candidate.url().includes("latamairlines.com")) || pages[0] || await browser.newPage();
    return { browser, page };
  } finally {
    clearTimeout(timer);
  }
}
