/**
 * Autenticação, permissões, limite de uso e registro das chamadas da
 * API interna VIA AIR. SERVER-ONLY.
 *
 * Nunca grava o token completo, PAN, CVV, código de acesso ou cookie.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { correlationIdOf, fail, failFromError, ok, type ApiErrorCode } from "./respond";
import type { ApiScope } from "./scopes";

export type ApiClient = {
  id: string;
  name: string;
  client_code: string;
  environment: string;
  token_prefix: string;
  token_last4: string;
  scopes: string[];
  active: boolean;
  rate_limit_per_min: number;
  expires_at: string | null;
  revoked_at: string | null;
};

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/* ------------------------------------------------------------------ */
/* Token                                                               */
/* ------------------------------------------------------------------ */

export function hashToken(token: string): string {
  return createHash("sha256").update(token.trim()).digest("hex");
}

/** Gera um token de alta entropia: vai_live_/vai_test_ + 48 caracteres. */
export function gerarToken(environment: "live" | "test"): {
  token: string;
  prefix: string;
  hash: string;
  last4: string;
} {
  const prefix = environment === "test" ? "vai_test_" : "vai_live_";
  const corpo = randomBytes(36).toString("base64url").replace(/[^A-Za-z0-9]/g, "").slice(0, 48);
  const token = `${prefix}${corpo}`;
  return { token, prefix, hash: hashToken(token), last4: token.slice(-4) };
}

function mesmoHash(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/* ------------------------------------------------------------------ */
/* Validação da chamada                                                */
/* ------------------------------------------------------------------ */

type Falha = { code: ApiErrorCode; message: string };

async function autenticar(request: Request): Promise<{ client: ApiClient } | { erro: Falha }> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token || !/^vai_(live|test)_[A-Za-z0-9]{24,80}$/.test(token)) {
    return { erro: { code: "unauthorized", message: "Token ausente ou mal formado." } };
  }
  const hash = hashToken(token);
  const supabase = await db();
  const { data } = await supabase
    .from("api_clients")
    .select(
      "id,name,client_code,environment,token_prefix,token_last4,token_hash,scopes,active,rate_limit_per_min,expires_at,revoked_at",
    )
    .eq("token_hash", hash)
    .maybeSingle();
  const row = data as (ApiClient & { token_hash: string }) | null;
  if (!row || !mesmoHash(row.token_hash, hash)) {
    return { erro: { code: "unauthorized", message: "Token inválido." } };
  }
  if (!row.active || row.revoked_at) {
    return { erro: { code: "unauthorized", message: "Token revogado." } };
  }
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    return { erro: { code: "unauthorized", message: "Token expirado." } };
  }
  return { client: row };
}

async function dentroDoLimite(client: ApiClient): Promise<boolean> {
  const supabase = await db();
  const desde = new Date(Date.now() - 60_000).toISOString();
  const { count } = await supabase
    .from("api_request_logs")
    .select("id", { count: "exact", head: true })
    .eq("api_client_id", client.id)
    .gte("created_at", desde);
  return (count ?? 0) < (client.rate_limit_per_min || 120);
}

async function registrarChamada(args: {
  clientId: string | null;
  endpoint: string;
  method: string;
  status: number;
  correlationId: string;
  durationMs: number;
  errorCode?: string | null;
}) {
  try {
    const supabase = await db();
    await supabase.from("api_request_logs").insert({
      api_client_id: args.clientId,
      endpoint: args.endpoint.slice(0, 300),
      method: args.method,
      status: args.status,
      correlation_id: args.correlationId,
      duration_ms: args.durationMs,
      error_code: args.errorCode ?? null,
    } as never);
    if (args.clientId) {
      await supabase
        .from("api_clients")
        .update({ last_used_at: new Date().toISOString() } as never)
        .eq("id", args.clientId);
    }
  } catch {
    /* registro nunca derruba a chamada */
  }
}

export type ApiContext = {
  client: ApiClient;
  correlationId: string;
  request: Request;
  /** Corpo JSON já lido (quando houver). */
  body: Record<string, unknown>;
  idempotencyKey: string | null;
};

/**
 * Executa um endpoint com token, permissão, limite de uso, registro e
 * tratamento de erro padronizados.
 */
export async function withApi(
  request: Request,
  scope: ApiScope | ApiScope[],
  handler: (ctx: ApiContext) => Promise<Response>,
): Promise<Response> {
  const inicio = Date.now();
  const correlationId = correlationIdOf(request);
  const endpoint = new URL(request.url).pathname;
  let clientId: string | null = null;
  let resposta: Response;

  try {
    const auth = await autenticar(request);
    if ("erro" in auth) {
      resposta = fail(auth.erro.code, auth.erro.message, correlationId);
    } else {
      clientId = auth.client.id;
      const exigidos = Array.isArray(scope) ? scope : [scope];
      const temPermissao = exigidos.every((s) => auth.client.scopes.includes(s));
      if (!temPermissao) {
        resposta = fail(
          "forbidden",
          `Este token não tem a permissão necessária (${exigidos.join(", ")}).`,
          correlationId,
        );
      } else if (!(await dentroDoLimite(auth.client))) {
        resposta = fail("rate_limited", "Limite de chamadas por minuto atingido.", correlationId);
      } else {
        let body: Record<string, unknown> = {};
        if (request.method !== "GET" && request.method !== "DELETE") {
          const texto = await request.text();
          if (texto) {
            try {
              body = JSON.parse(texto) as Record<string, unknown>;
            } catch {
              body = {};
            }
          }
        }
        const idempotencyKey = request.headers.get("idempotency-key");
        resposta = await handler({
          client: auth.client,
          correlationId,
          request,
          body,
          idempotencyKey: idempotencyKey && idempotencyKey.length <= 120 ? idempotencyKey : null,
        });
      }
    }
  } catch (e) {
    resposta = failFromError(e, correlationId);
  }

  await registrarChamada({
    clientId,
    endpoint,
    method: request.method,
    status: resposta.status,
    correlationId,
    durationMs: Date.now() - inicio,
    errorCode: resposta.status >= 400 ? String(resposta.status) : null,
  });
  return resposta;
}

export { ok, fail };
