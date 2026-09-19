/**
 * BUSCA ASSÍNCRONA DE SERVIÇOS (search_id).
 *
 * A Sky Hub monta o pacote com aéreo e hotel sem esperar os serviços:
 *   POST /services/search { ..., "async": true }  -> { search_id, services: { status: "processing" } }
 *   GET  /services/search/{search_id}             -> estado atual + itens quando prontos
 *
 * Os blocos `air` e `hotel` são responsabilidade da Sky Hub; aqui só existe o
 * bloco `services`, que nunca invalida o restante do pacote: se falhar, o erro
 * fica contido neste bloco.
 *
 * SERVER-ONLY.
 */
import { randomBytes } from "node:crypto";
import type { ServicesSearchInput, ServicesSearchResult } from "./comprefacil-services.server";

export type EstadoServicos = "processing" | "completed" | "empty" | "error";

export type BlocoServicos = {
  status: EstadoServicos;
  iniciado_em: string;
  concluido_em: string | null;
  duracao_ms: number | null;
  /** presente quando status = completed/empty */
  resultado?: ServicesSearchResult | null;
  /** presente quando status = error */
  erro?: { codigo: string; mensagem: string } | null;
};

export type RespostaAsync = { search_id: string; services: BlocoServicos };

const VALIDADE_MS = 2 * 60 * 60 * 1000;
/** Uma busca nunca fica "processing" para sempre. */
const TETO_JOB_MS = 90_000;

const emMemoria = new Map<string, BlocoServicos>();

function novoSearchId(): string {
  return `svcjob_${randomBytes(12).toString("base64url").replace(/[^A-Za-z0-9]/g, "").slice(0, 20)}`;
}

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function gravar(
  searchId: string,
  clientId: string | null,
  bloco: BlocoServicos,
  novo = false,
) {
  emMemoria.set(searchId, bloco);
  const supabase = await db();
  const kind = `svcjob:${searchId}`;
  const expires_at = new Date(Date.now() + VALIDADE_MS).toISOString();
  if (novo) {
    await supabase.from("api_offer_refs").insert({
      api_client_id: clientId,
      search_id: searchId,
      kind,
      payload: bloco as never,
      expires_at,
    } as never);
    return;
  }
  await supabase
    .from("api_offer_refs")
    .update({ payload: bloco as never, expires_at } as never)
    .eq("kind", kind);
}

/** Dispara a busca em segundo plano e devolve o search_id na hora. */
export async function iniciarBuscaServicos(
  input: ServicesSearchInput,
  clientId: string | null,
): Promise<RespostaAsync> {
  const searchId = novoSearchId();
  const bloco: BlocoServicos = {
    status: "processing",
    iniciado_em: new Date().toISOString(),
    concluido_em: null,
    duracao_ms: null,
    resultado: null,
    erro: null,
  };
  await gravar(searchId, clientId, bloco);

  const t0 = Date.now();
  void (async () => {
    try {
      const { buscarServicos } = await import("./comprefacil-services.server");
      const resultado = await buscarServicos(input, clientId);
      await gravar(searchId, clientId, {
        status: resultado.total > 0 ? "completed" : "empty",
        iniciado_em: bloco.iniciado_em,
        concluido_em: new Date().toISOString(),
        duracao_ms: Date.now() - t0,
        resultado,
        erro: null,
      });
    } catch (e) {
      await gravar(searchId, clientId, {
        status: "error",
        iniciado_em: bloco.iniciado_em,
        concluido_em: new Date().toISOString(),
        duracao_ms: Date.now() - t0,
        resultado: null,
        erro: {
          codigo: "falha_fornecedor",
          mensagem: e instanceof Error ? e.message : "Falha ao consultar a operadora.",
        },
      });
    }
  })();

  return { search_id: searchId, services: bloco };
}

/** Estado atual de uma busca assíncrona. */
export async function estadoBuscaServicos(searchId: string): Promise<RespostaAsync | null> {
  let bloco = emMemoria.get(searchId) ?? null;
  if (!bloco) {
    const supabase = await db();
    const { data } = await supabase
      .from("api_offer_refs")
      .select("payload,expires_at")
      .eq("kind", `svcjob:${searchId}`)
      .maybeSingle();
    const row = data as { payload: BlocoServicos; expires_at: string } | null;
    if (!row || new Date(row.expires_at).getTime() < Date.now()) return null;
    bloco = row.payload;
  }

  // Trava de segurança: processando além do teto vira erro explícito, nunca
  // uma espera infinita do lado da Sky Hub.
  if (
    bloco.status === "processing" &&
    Date.now() - new Date(bloco.iniciado_em).getTime() > TETO_JOB_MS
  ) {
    bloco = {
      ...bloco,
      status: "error",
      concluido_em: new Date().toISOString(),
      duracao_ms: Date.now() - new Date(bloco.iniciado_em).getTime(),
      erro: { codigo: "tempo_excedido", mensagem: "A operadora não respondeu a tempo." },
    };
    emMemoria.set(searchId, bloco);
  }

  return { search_id: searchId, services: bloco };
}
