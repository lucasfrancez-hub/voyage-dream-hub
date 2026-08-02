/**
 * Origem recuperada do histórico — SUGESTÃO, nunca presunção.
 *
 * A última origem realmente usada em uma pesquisa aérea do cliente pode ser
 * oferecida para confirmação ("vai manter o embarque por Maringá?"), mas nunca
 * enviada ao motor de busca sem o cliente confirmar naquela nova cotação.
 */

type QuotePayload = { origem_nome?: unknown; origem_iata?: unknown };

/**
 * Última origem confirmada pelo cliente em pesquisas anteriores desta conversa
 * (inclusive de protocolos antigos). Retorna null quando não houver histórico.
 */
export async function loadOrigemSugeridaPeloHistorico(
  conversationId: string,
  dias = 180,
): Promise<string | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabaseAdmin
      .from("wa_flight_quotes")
      .select("payload, created_at")
      .eq("conversation_id", conversationId)
      .gte("created_at", desde)
      .order("created_at", { ascending: false })
      .limit(5);

    for (const row of (data ?? []) as Array<{ payload: unknown }>) {
      const p = (row.payload ?? {}) as QuotePayload;
      const nome = typeof p.origem_nome === "string" ? p.origem_nome.trim() : "";
      const iata = typeof p.origem_iata === "string" ? p.origem_iata.trim() : "";
      const escolhida = nome.length > 1 ? nome : iata.length > 1 ? iata : "";
      if (escolhida) return escolhida;
    }
  } catch (err) {
    console.warn("[origem-historico] falha ao carregar origem sugerida:", err);
  }
  return null;
}
