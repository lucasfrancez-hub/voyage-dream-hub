/**
 * Respostas padronizadas da API interna VIA AIR (v1).
 * Client-safe: só formatação, nenhum segredo.
 */

export type ApiErrorCode =
  | "unauthorized"
  | "forbidden"
  | "invalid_request"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "provider_error"
  | "provider_unavailable"
  | "price_changed"
  | "payment_declined"
  | "internal_error";

const STATUS: Record<ApiErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  invalid_request: 422,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  provider_error: 502,
  provider_unavailable: 503,
  price_changed: 409,
  payment_declined: 402,
  internal_error: 500,
};

const RETRYABLE: ApiErrorCode[] = ["provider_unavailable", "rate_limited", "internal_error"];

export const API_VERSION = "1.0.0";

export function correlationIdOf(request: Request): string {
  const vindo = request.headers.get("x-correlation-id");
  if (vindo && /^[\w.:-]{6,80}$/.test(vindo)) return vindo;
  return `cid_${crypto.randomUUID().replace(/-/g, "")}`;
}

function baseHeaders(correlationId: string): Record<string, string> {
  return {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-correlation-id": correlationId,
    "x-api-version": API_VERSION,
  };
}

export function ok(body: unknown, correlationId: string, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: baseHeaders(correlationId) });
}

export function fail(
  code: ApiErrorCode,
  message: string,
  correlationId: string,
  extra?: { provider?: string | null; status?: number; details?: unknown },
): Response {
  const status = extra?.status ?? STATUS[code];
  return new Response(
    JSON.stringify({
      error: {
        code,
        message,
        provider: extra?.provider ?? null,
        retryable: RETRYABLE.includes(code),
        correlationId,
        ...(extra?.details === undefined ? {} : { details: extra.details }),
      },
    }),
    { status, headers: baseHeaders(correlationId) },
  );
}

/** Traduz um erro cru (exception) em resposta segura, sem vazar detalhe interno. */
export function failFromError(e: unknown, correlationId: string, provider = "oner"): Response {
  const msg = e instanceof Error ? e.message : String(e);
  if (/timeout|cancelad/i.test(msg)) {
    return fail("provider_unavailable", "O fornecedor não respondeu a tempo.", correlationId, {
      provider,
    });
  }
  return fail("provider_error", "Não foi possível concluir a operação no fornecedor.", correlationId, {
    provider,
  });
}
