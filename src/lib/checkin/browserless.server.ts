/**
 * Cliente HTTP para Browserless (Chrome remoto).
 * Roda um script Puppeteer dentro do Chrome deles e devolve o resultado.
 * Endpoint: /function — https://docs.browserless.io/HTTP-APIs/function
 */

const BROWSERLESS_BASE = "https://production-sfo.browserless.io";

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
      throw new Error(`Browserless HTTP ${res.status}: ${text.slice(0, 500)}`);
    }
    const json = (await res.json()) as BrowserlessRunResult<T>;
    return json;
  } finally {
    clearTimeout(to);
  }
}
