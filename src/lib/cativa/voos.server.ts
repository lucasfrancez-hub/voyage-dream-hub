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
    .select("id, link_orcamento, voos_tentativas, origem_iata, origem_cidade, destino, aereo_por, taxas, valor_total, hoteis")
    .eq("status", "ativo")
    .eq("voos_status", "pendente")
    .or("categoria.is.null,categoria.neq.Circuito")
    .lte("voos_proxima_em", agora)
    .order("voos_prioridade", { ascending: true })
    .order("voos_proxima_em", { ascending: true })
    .limit(limite);


  const res: ResultadoVoos = { processados: 0, ok: 0, erros: 0 };

  for (const p of (pendentes ?? []) as any[]) {
    // Adquire o item de forma condicional. Duas rodadas podem ter lido a mesma
    // fila, mas apenas uma delas pode mudar pendente -> processando.
    if (p.link_orcamento) {
      const { data: adquirido } = await supabaseAdmin
        .from("cativa_pacotes")
        .update({ voos_status: "processando", voos_proxima_em: new Date(Date.now() + 10 * 60_000).toISOString() } as any)
        .eq("id", p.id)
        .eq("voos_status", "pendente")
        .select("id")
        .maybeSingle();
      if (!adquirido) continue;
    }
    const r = await processarPacote(p, supabaseAdmin, importInfotravelQuoteResilient);
    res.processados += 1;
    if (r === "ok") res.ok++;
    else res.erros++;
  }

  return res;
}

/** Processa um único pacote (consulta Infotravel e grava o resultado). */
async function processarPacote(
  p: any,
  supabaseAdmin: any,
  importInfotravelQuoteResilient: (url: string) => Promise<any>,
): Promise<"ok" | "erro"> {
  if (!p.link_orcamento) {
    await supabaseAdmin
      .from("cativa_pacotes")
      .update({ voos_status: "sem_link", voos_erro: "Pacote sem link de orçamento" } as any)
      .eq("id", p.id);
    return "erro";
  }

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
        ...completarCampos(p, opcoes),
        voos_status: opcoes.length ? "ok" : "sem_opcoes",
        voos_opcoes: opcoes.length,
        voos_atualizado_em: new Date().toISOString(),
        voos_erro: null,
        voos_tentativas: 0,
        voos_prioridade: 100,
        voos_proxima_em: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      } as any)
      .eq("id", p.id);
    return "ok";
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
    return "erro";
  }
}


/**
 * A planilha às vezes vem sem origem, destino, aéreo ou taxas. Quando o
 * orçamento da Infotravel traz esses dados, o pacote é completado aqui.
 */
export function completarCampos(pacote: any, opcoes: any[]): Record<string, any> {
  const patch: Record<string, any> = {};
  const num = (v: any) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const flights = opcoes.flatMap((o: any) => (Array.isArray(o?.flights) ? o.flights : []));
  const hotels = opcoes.flatMap((o: any) => (Array.isArray(o?.hotels) ? o.hotels : []));

  const ida = flights.find((f: any) => f?.direction !== "INBOUND") ?? flights[0];
  const segs = Array.isArray(ida?.segments) ? ida.segments : [];
  const primeiro = segs[0];
  const ultimo = segs[segs.length - 1];

  if (!pacote.origem_iata && (primeiro?.fromIata || ida?.fromIata)) {
    patch['origem_iata'] = primeiro?.fromIata ?? ida?.fromIata;
  }
  if (!pacote.origem_cidade && primeiro?.fromCity) patch['origem_cidade'] = primeiro.fromCity;

  if (!pacote.destino) {
    // O destino comercial é o do hotel/roteiro; o voo é só o último recurso.
    const destino =
      opcoes.find((o: any) => o?.destination)?.destination ??
      hotels.find((h: any) => h?.city)?.city ??
      ultimo?.toCity ??
      ultimo?.toIata ??
      ida?.toIata ??
      null;
    if (destino) patch['destino'] = String(destino);
  }

  // Aéreo: SOMENTE o valor dos voos (nunca o total da opção, que inclui hotel).
  if (!pacote.aereo_por) {
    const porOpcao = opcoes
      .map((o: any) => {
        const fs = Array.isArray(o?.flights) ? o.flights : [];
        const soma = fs.reduce((acc: number, f: any) => acc + (num(f?.total) ?? 0), 0);
        return soma > 0 ? soma : null;
      })
      .filter((n: number | null): n is number => n != null);
    if (porOpcao.length) patch['aereo_por'] = Math.round(Math.min(...porOpcao) * 100) / 100;
  }

  // Taxas: quando a planilha não trouxe, usa a do hotel da própria linha.
  if (pacote.taxas == null) {
    const hotelTaxa = (Array.isArray(pacote.hoteis) ? pacote.hoteis : [])
      .map((h: any) => num(h?.taxas))
      .find((n: number | null) => n != null);
    if (hotelTaxa) patch['taxas'] = hotelTaxa;
  }

  if (patch['aereo_por'] || patch['taxas']) {
    const aereo = num(patch['aereo_por'] ?? pacote.aereo_por) ?? 0;
    const taxas = num(patch['taxas'] ?? pacote.taxas) ?? 0;
    const hotel = num(Array.isArray(pacote.hoteis) ? pacote.hoteis[0]?.valor : null) ?? 0;
    const total = aereo + taxas + hotel;
    if (total > 0) patch['valor_total'] = Math.round(total * 100) / 100;
  }

  return patch;
}

/** Força a reconsulta imediata da Infotravel para pacotes específicos. */
export async function reprocessarPacotes(ids: string[]): Promise<ResultadoVoos> {
  if (!ids.length) return { processados: 0, ok: 0, erros: 0 };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const agora = new Date().toISOString();
  await supabaseAdmin
    .from("cativa_pacotes")
    .update({
      voos_status: "pendente",
      voos_prioridade: 1,
      voos_tentativas: 0,
      voos_proxima_em: agora,
    } as any)
    .in("id", ids)
    // Não devolve à fila um item que outro worker ainda está processando.
    // Só recupera "processando" quando a lease já venceu.
    .or(`voos_status.neq.processando,voos_proxima_em.lte.${agora}`);
  // Mantém cada chamada abaixo do limite do servidor. A continuação é feita
  // pelo painel/cron em novos lotes, sem perder o progresso já salvo.
  return await processarFilaVoos(Math.min(ids.length, 5));
}
