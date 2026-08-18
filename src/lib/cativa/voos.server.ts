/**
 * Fila de enriquecimento com voos (Infotravel).
 * Só processa pacotes marcados como pendentes pela sincronização das planilhas.
 */

const MAX_TENTATIVAS = 4;

export type ResultadoVoos = { processados: number; ok: number; erros: number; pausado?: string };

export async function processarFilaVoos(limite = 15): Promise<ResultadoVoos> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { importInfotravelQuoteResilient } = await import("@/lib/quotes/infotravel-api.server");

  const agora = new Date().toISOString();

  // Reclama leases vencidos: se um processamento morreu no meio (timeout/deploy),
  // o pacote ficaria preso em "processando" para sempre.
  await supabaseAdmin
    .from("cativa_pacotes")
    .update({ voos_status: "pendente" } as any)
    .eq("voos_status", "processando")
    .lte("voos_proxima_em", agora);

  // Circuitos não têm aéreo: a Infotravel devolve PASSENGERS_NOT_FOUND.
  // Eles saem da fila e ficam marcados como "circuito" para o painel próprio.
  await supabaseAdmin
    .from("cativa_pacotes")
    .update({ voos_status: "circuito", voos_erro: null, voos_tentativas: 0 } as any)
    .eq("categoria", "Circuito")
    .in("voos_status", ["pendente", "processando", "erro", "sem_opcoes"]);

  const { data: pendentes } = await supabaseAdmin
    .from("cativa_pacotes")
    .select("id, link_orcamento, voos_tentativas")
    .eq("status", "ativo")
    .eq("voos_status", "pendente")
    .or("categoria.is.null,categoria.neq.Circuito")
    .lte("voos_proxima_em", agora)
    .order("voos_prioridade", { ascending: true })
    .order("voos_proxima_em", { ascending: true })
    .limit(limite);


  const res: ResultadoVoos = { processados: 0, ok: 0, erros: 0 };

  for (const p of (pendentes ?? []) as any[]) {
    if (!p.link_orcamento) {
      await supabaseAdmin
        .from("cativa_pacotes")
        .update({ voos_status: "sem_link", voos_erro: "Pacote sem link de orçamento" } as any)
        .eq("id", p.id);
      res.erros++;
      continue;
    }

    // Adquire o item de forma condicional. Duas rodadas podem ter lido a mesma
    // fila, mas apenas uma delas pode mudar pendente -> processando.
    const { data: adquirido } = await supabaseAdmin
      .from("cativa_pacotes")
      .update({ voos_status: "processando", voos_proxima_em: new Date(Date.now() + 10 * 60_000).toISOString() } as any)
      .eq("id", p.id)
      .eq("voos_status", "pendente")
      .select("id")
      .maybeSingle();
    if (!adquirido) continue;
    res.processados++;

    try {
      const { normalized } = await importInfotravelQuoteResilient(p.link_orcamento);
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

/** Força a reconsulta imediata da Infotravel para pacotes específicos. */
export async function reprocessarPacotes(ids: string[]): Promise<ResultadoVoos> {
  if (!ids.length) return { processados: 0, ok: 0, erros: 0 };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("cativa_pacotes")
    .update({
      voos_status: "pendente",
      voos_prioridade: 1,
      voos_tentativas: 0,
      voos_proxima_em: new Date().toISOString(),
    } as any)
    .in("id", ids);
  // Mantém cada chamada abaixo do limite do servidor. A continuação é feita
  // pelo painel/cron em novos lotes, sem perder o progresso já salvo.
  return await processarFilaVoos(Math.min(ids.length, 5));
}
