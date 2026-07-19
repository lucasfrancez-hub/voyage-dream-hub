/**
 * Cliente HTTP para Browserless (Chrome remoto).
 * Roda um script Playwright dentro do Chrome deles e devolve o resultado.
 * Endpoint: /function — https://docs.browserless.io/HTTP-APIs/function
 */

const BROWSERLESS_BASE = "https://production-sfo.browserless.io";

export interface BrowserlessRunResult<T = unknown> {
  data?: T;
  type?: string;
}

/**
 * Executa uma função JS remota no Chrome do Browserless.
 * O `code` deve exportar `default async ({ page, context }) => { ... return { data: ... } }`.
 */
export async function runBrowserlessFunction<T = unknown>(
  code: string,
  context: Record<string, unknown> = {},
  { timeoutMs = 120_000 }: { timeoutMs?: number } = {},
): Promise<BrowserlessRunResult<T>> {
  const token = process.env.BROWSERLESS_TOKEN;
  if (!token) throw new Error("BROWSERLESS_TOKEN não configurado");

  const url = `${BROWSERLESS_BASE}/function?token=${encodeURIComponent(token)}&timeout=${timeoutMs}`;

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
