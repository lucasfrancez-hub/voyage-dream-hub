/**
 * Idempotência das chamadas mutáveis da API interna.
 * Mesma chave + mesmo corpo devolve a resposta original; mesma chave com
 * corpo diferente é conflito. SERVER-ONLY.
 */
import { createHash } from "node:crypto";
import { fail, ok } from "./respond";

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function hashCorpo(corpo: unknown): string {
  return createHash("sha256").update(JSON.stringify(corpo ?? {})).digest("hex");
}

/**
 * Envolve a execução de um endpoint mutável.
 * Sem chave de idempotência, executa direto.
 */
export async function comIdempotencia(
  args: {
    clientId: string;
    idempotencyKey: string | null;
    endpoint: string;
    body: unknown;
    correlationId: string;
  },
  executar: () => Promise<Response>,
): Promise<Response> {
  if (!args.idempotencyKey) return executar();
  const supabase = await db();
  const request_hash = hashCorpo(args.body);

  const { data: existente } = await supabase
    .from("api_idempotency_keys")
    .select("request_hash,status,response")
    .eq("api_client_id", args.clientId)
    .eq("idempotency_key", args.idempotencyKey)
    .eq("endpoint", args.endpoint)
    .maybeSingle();

  const linha = existente as { request_hash: string; status: number | null; response: unknown } | null;
  if (linha) {
    if (linha.request_hash !== request_hash) {
      return fail(
        "conflict",
        "Esta chave de idempotência já foi usada com outro conteúdo.",
        args.correlationId,
      );
    }
    if (linha.status && linha.response) {
      return ok(linha.response, args.correlationId, linha.status);
    }
    return fail("conflict", "Uma chamada com esta chave ainda está em andamento.", args.correlationId);
  }

  await supabase.from("api_idempotency_keys").insert({
    api_client_id: args.clientId,
    idempotency_key: args.idempotencyKey,
    endpoint: args.endpoint,
    request_hash,
  } as never);

  const resposta = await executar();
  try {
    const clone = resposta.clone();
    const corpo = (await clone.json()) as unknown;
    if (resposta.status < 500) {
      await supabase
        .from("api_idempotency_keys")
        .update({ status: resposta.status, response: corpo as never } as never)
        .eq("api_client_id", args.clientId)
        .eq("idempotency_key", args.idempotencyKey)
        .eq("endpoint", args.endpoint);
    }
  } catch {
    /* resposta não-JSON: não guarda */
  }
  return resposta;
}
