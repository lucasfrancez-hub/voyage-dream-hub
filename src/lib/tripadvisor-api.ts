const TRIPADVISOR_BASE = "https://terra.tripadvisor.com/api";

let queue: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;
const MIN_INTERVAL_MS = 400;

function enqueue<T>(request: () => Promise<T>): Promise<T> {
  const next = queue.then(async () => {
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequestAt = Date.now();
    return request();
  });
  queue = next.catch(() => undefined);
  return next;
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = Number(response.headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(retryAfter * 1000, 10_000);
  }
  return 1_200 * (attempt + 1);
}

/**
 * Única porta de acesso à API do TripAdvisor no app. Serializa chamadas de
 * todos os fluxos e trata 429 como limite momentâneo por segundo, não como
 * bloqueio da conta.
 */
export async function tripAdvisorFetch(
  pathOrUrl: string,
  options?: { signal?: AbortSignal; params?: Record<string, string> },
): Promise<Response> {
  const apiKey = process.env["TRIPADVISOR_API_KEY"];
  if (!apiKey) throw new Error("TRIPADVISOR_API_KEY não configurada");

  const url = pathOrUrl.startsWith("http")
    ? new URL(pathOrUrl)
    : new URL(`${TRIPADVISOR_BASE}${pathOrUrl}`);
  Object.entries(options?.params ?? {}).forEach(([name, value]) => url.searchParams.set(name, value));

  const request = () => fetch(url, {
    signal: options?.signal,
    headers: { accept: "application/json", "X-API-KEY": apiKey },
  });

  let response = await enqueue(request);
  for (let attempt = 0; response.status === 429 && attempt < 2; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
    response = await enqueue(request);
  }
  return response;
}