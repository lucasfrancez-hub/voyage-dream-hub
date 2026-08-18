/**
 * Fila de enriquecimento com voos (Infotravel).
 * Só processa pacotes marcados como pendentes pela sincronização das planilhas.
 */

const MAX_TENTATIVAS = 4;

export type ResultadoVoos = { processados: number; ok: number; erros: number; pausado?: string };

export async function processarFilaVoos(limite = 15): Promise<ResultadoVoos> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { importInfotravelQuote } = await import("@/lib/quotes/infotravel-api.server");

  const agora = new Date().toISOString();
  const { data: pendentes } = await supabaseAdmin
    .from("cativa_pacotes")
    .select("id, link_orcamento, voos_tentativas")
    .eq("status", "ativo")
    .eq("voos_status", "pendente")
    .lte("voos_proxima_em", agora)
    .order("voos_prioridade", { ascending: true })
    .order("voos_proxima_em", { ascending: true })
    .limit(limite);

  const res: ResultadoVoos = { processados: 0, ok: 0, erros: 0 };

  for (const p of (pendentes ?? []) as any[]) {
    res.processados++;
    if (!p.link_orcamento) {
      await supabaseAdmin
        .from("cativa_pacotes")
        .update({ voos_status: "sem_link", voos_erro: "Pacote sem link de orçamento" } as any)
        .eq("id", p.id);
      res.erros++;
      continue;
    }

    // marca como em processamento para não repetir em execuções paralelas
    await supabaseAdmin
      .from("cativa_pacotes")
      .update({ voos_status: "processando", voos_proxima_em: new Date(Date.now() + 10 * 60_000).toISOString() } as any)
      .eq("id", p.id);

    try {
      const { normalized } = await importInfotravelQuote(p.link_orcamento);
      const opcoes = normalized.options ?? [];

      await supabaseAdmin.from("cativa_pacote_voos").delete().eq("pacote_id", p.id);
      if (opcoes.length) {
        await supabaseAdmin.from("cativa_pacote_voos").insert(
          opcoes.map((o: any, i: number) => ({
            pacote_id: p.id,
            opcao_numero: i + 1,
            label: o.label ?? o.name ?? `Opção ${i + 1}`,
            companhia: o.flights?.[0]?.airline ?? null,
            total: typeof o.total === "number" ? o.total : null,
            moeda: o.currency ?? "BRL",
            voos: o.flights ?? [],
            hoteis: o.hotels ?? [],
            detalhes: {
              transfers: o.transfers ?? [],
              tickets: o.tickets ?? [],
              activities: o.activities ?? [],
              insurance: o.insurance ?? [],
              services: o.services ?? [],
              notes: o.notes ?? null,
              startDate: o.startDate ?? null,
              endDate: o.endDate ?? null,
            },
          })) as any,
        );
      }

      await supabaseAdmin
        .from("cativa_pacotes")
        .update({
          voos_status: opcoes.length ? "ok" : "sem_opcoes",
          voos_opcoes: opcoes.length,
          voos_atualizado_em: new Date().toISOString(),
          voos_erro: null,
          voos_tentativas: 0,
          voos_prioridade: 100,
          voos_proxima_em: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        } as any)
        .eq("id", p.id);
      res.ok++;
    } catch (e) {
      const tentativas = (p.voos_tentativas ?? 0) + 1;
      const backoffMin = Math.min(60 * 12, 15 * 2 ** (tentativas - 1));
      await supabaseAdmin
        .from("cativa_pacotes")
        .update({
          voos_status: tentativas >= MAX_TENTATIVAS ? "erro" : "pendente",
          voos_tentativas: tentativas,
          voos_erro: (e as Error).message.slice(0, 500),
          voos_proxima_em: new Date(Date.now() + backoffMin * 60_000).toISOString(),
        } as any)
        .eq("id", p.id);
      res.erros++;
    }
  }

  return res;
}
