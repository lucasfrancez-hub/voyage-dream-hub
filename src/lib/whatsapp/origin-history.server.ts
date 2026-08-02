/**
 * Origem recuperada do histórico.
 *
 * Duas situações MUITO diferentes:
 *
 * 1. Mesmo protocolo (atendimento em andamento) — a origem já foi confirmada
 *    pelo cliente neste atendimento. Reutilize direto, sem perguntar de novo.
 *    Se ele mudar o destino ("agora quero ir pra Florianópolis"), a origem
 *    continua valendo.
 *
 * 2. Protocolo anterior — a origem é só SUGESTÃO. Precisa de confirmação
 *    ("vai manter o embarque por Maringá?") antes de pesquisar.
 */

type QuotePayload = { origem_nome?: unknown; origem_iata?: unknown };

export type OrigemHistorico = {
  /** Origem já confirmada dentro do protocolo atual (reutilizar sem perguntar). */
  confirmadaNoProtocolo: string | null;
  /** Origem de protocolo anterior — só sugestão, exige confirmação. */
  sugerida: string | null;
};

function extrairOrigem(payload: unknown): string | null {
  const p = (payload ?? {}) as QuotePayload;
  const nome = typeof p.origem_nome === "string" ? p.origem_nome.trim() : "";
  const iata = typeof p.origem_iata === "string" ? p.origem_iata.trim() : "";
  if (nome.length > 1) return nome;
  if (iata.length > 1) return iata;
  return null;
}

export async function loadOrigemHistorico(
  conversationId: string,
  protocoloId?: string | null,
  dias = 180,
): Promise<OrigemHistorico> {
  const vazio: OrigemHistorico = { confirmadaNoProtocolo: null, sugerida: null };
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabaseAdmin
      .from("wa_flight_quotes")
      .select("payload, protocolo_id, created_at")
      .eq("conversation_id", conversationId)
      .gte("created_at", desde)
      .order("created_at", { ascending: false })
      .limit(10);

    const rows = (data ?? []) as Array<{ payload: unknown; protocolo_id: string | null }>;
    let sugerida: string | null = null;
    for (const row of rows) {
      const origem = extrairOrigem(row.payload);
      if (!origem) continue;
      if (protocoloId && row.protocolo_id === protocoloId) {
        return { confirmadaNoProtocolo: origem, sugerida: null };
      }
      if (!sugerida) sugerida = origem;
    }
    return { confirmadaNoProtocolo: null, sugerida };
  } catch (err) {
    console.warn("[origem-historico] falha ao carregar origem:", err);
    return vazio;
  }
}
