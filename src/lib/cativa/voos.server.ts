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
  importar: (url: string, opts?: { tentativas?: number; esperaMs?: number }) => Promise<any>,
  opts?: { tentativas?: number; esperaMs?: number },
): Promise<"ok" | "erro"> {
  const { linkOrcamentoUtilizavel } = await import("@/lib/quotes/infotravel-api.server");
  const link = p.link_orcamento ? linkOrcamentoUtilizavel(p.link_orcamento) : null;

  if (!link) {
    await supabaseAdmin
      .from("cativa_pacotes")
      .update({
        voos_status: "sem_link",
        voos_erro: p.link_orcamento
          ? "Link da planilha abre a área logada da Cativa (sem token do orçamento). Cole o link do Orçamento Web (premium.infotravel.com.br/orcamento-web/pt/link?token=...)."
          : "Pacote sem link de orçamento",
        voos_tentativas: 0,
        voos_proxima_em: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      } as any)
      .eq("id", p.id);
    return "erro";
  }

  try {
    const { normalized } = await importar(link, opts);
    const opcoes = normalized.options ?? [];

    // Não descarta o que já estava salvo quando a consulta volta pior/vazia:
    // antes, um reprocesso frio apagava os voos e o pacote ficava zerado.
    const { count: existentes } = await supabaseAdmin
      .from("cativa_pacote_voos")
      .select("id", { count: "exact", head: true })
      .eq("pacote_id", p.id);

    const completas = opcoes.filter(
      (o: any) => (o?.flights?.length || o?.hotels?.length) && typeof o?.total === "number" && o.total > 0,
    ).length;

    if (!opcoes.length && (existentes ?? 0) > 0) {
      throw new Error("Consulta voltou sem opções; dados anteriores mantidos");
    }

    if (opcoes.length) {
      await supabaseAdmin.from("cativa_pacote_voos").delete().eq("pacote_id", p.id);
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
            taxas: typeof o.taxes === "number" ? o.taxes : null,
            // ocupação do orçamento: o total da Infotravel é do grupo todo
            pax: normalized.passengers ?? null,
            startDate: o.startDate ?? null,
            endDate: o.endDate ?? null,
          },
        })) as any,
      );
    }

    const incompleto = opcoes.length > 0 && completas < opcoes.length;

    await supabaseAdmin
      .from("cativa_pacotes")
      .update({
        ...completarCampos(p, opcoes),
        voos_status: opcoes.length ? "ok" : "sem_opcoes",
        voos_opcoes: opcoes.length,
        voos_atualizado_em: new Date().toISOString(),
        voos_erro: incompleto ? `${completas}/${opcoes.length} opções com voos e valores completos` : null,
        voos_tentativas: 0,
        voos_prioridade: incompleto ? 5 : 100,
        // Opção sem valor/voo volta à fila em minutos; completa só na revisão semanal.
        voos_proxima_em: new Date(
          Date.now() + (incompleto ? 20 * 60_000 : 7 * 24 * 60 * 60 * 1000),
        ).toISOString(),
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

  // Aéreo: SOMENTE a tarifa por passageiro, sem taxas. Importações antigas não
  // têm `fare`, então o total do voo continua como fallback.
  if (!pacote.aereo_por) {
    const porOpcao = opcoes
      .map((o: any) => {
        const fs = Array.isArray(o?.flights) ? o.flights : [];
        const tarifas = fs.map((f: any) => num(f?.fare)).filter((v: number | null): v is number => v != null);
        const soma = tarifas.length
          ? tarifas.reduce((acc: number, valor: number) => acc + valor, 0)
          : fs.reduce((acc: number, f: any) => acc + (num(f?.total) ?? 0), 0);
        return soma > 0 ? soma : null;
      })
      .filter((n: number | null): n is number => n != null);
    if (porOpcao.length) patch['aereo_por'] = Math.round(Math.min(...porOpcao) * 100) / 100;
  }

  // Taxas: prioriza a composição aérea retornada pela Infotravel. A API marca
  // BOARDING_RATE/TAX_ADM (e demais itens isFareRate) separadamente da tarifa.
  if (pacote.taxas == null) {
    const porOpcao = opcoes
      .map((o: any) => {
        // A Infotravel devolve as taxas de todos os produtos da opção; o aéreo
        // é só o fallback para importações antigas.
        const daOpcao = num(o?.taxes);
        if (daOpcao != null && daOpcao > 0) return daOpcao;
        const fs = Array.isArray(o?.flights) ? o.flights : [];
        const soma = fs.reduce((acc: number, f: any) => acc + (num(f?.taxes) ?? 0), 0);
        return soma > 0 ? soma : null;
      })
      .filter((n: number | null): n is number => n != null);
    const hotelTaxa = (Array.isArray(pacote.hoteis) ? pacote.hoteis : [])
      .map((h: any) => num(h?.taxas))
      .find((n: number | null) => n != null);
    if (porOpcao.length) patch['taxas'] = Math.round(Math.min(...porOpcao) * 100) / 100;
    else if (hotelTaxa) patch['taxas'] = hotelTaxa;
  }

  // Total: o valor oficial da opção da Infotravel (produtos + taxas) manda.
  const totaisOpcoes = opcoes
    .map((o: any) => num(o?.total))
    .filter((n: number | null): n is number => n != null && n > 0);
  if (totaisOpcoes.length) {
    patch['valor_total'] = Math.round(Math.min(...totaisOpcoes) * 100) / 100;
  } else if (patch['aereo_por'] || patch['taxas']) {
    const aereo = num(patch['aereo_por'] ?? pacote.aereo_por) ?? 0;
    const taxas = num(patch['taxas'] ?? pacote.taxas) ?? 0;
    const hotel = num(Array.isArray(pacote.hoteis) ? pacote.hoteis[0]?.valor : null) ?? 0;
    const total = aereo + taxas + hotel;
    if (total > 0) patch['valor_total'] = Math.round(total * 100) / 100;
  }

  return patch;
}

/**
 * Reconsulta a Infotravel AGORA para os pacotes indicados.
 * Não passa pela fila geral: antes, o item só voltava para "pendente" e a fila
 * podia processar outros pacotes, deixando o reprocessado sem nada.
 */
export async function reprocessarPacotes(ids: string[]): Promise<ResultadoVoos> {
  if (!ids.length) return { processados: 0, ok: 0, erros: 0 };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { importInfotravelQuoteResilient } = await import("@/lib/quotes/infotravel-api.server");

  // Mantém cada chamada abaixo do limite de tempo do servidor.
  const alvo = ids.slice(0, 5);
  const agora = new Date().toISOString();

  await supabaseAdmin
    .from("cativa_pacotes")
    .update({
      voos_status: "processando",
      voos_prioridade: 1,
      voos_tentativas: 0,
      voos_proxima_em: new Date(Date.now() + 10 * 60_000).toISOString(),
    } as any)
    .in("id", alvo)
    // Não rouba um item que outro worker ainda está processando dentro da lease.
    .or(`voos_status.neq.processando,voos_proxima_em.lte.${agora}`);

  const { data: pacotes } = await supabaseAdmin
    .from("cativa_pacotes")
    .select("id, link_orcamento, voos_tentativas, origem_iata, origem_cidade, destino, aereo_por, taxas, valor_total, hoteis")
    .in("id", alvo);

  const res: ResultadoVoos = { processados: 0, ok: 0, erros: 0 };
  for (const p of (pacotes ?? []) as any[]) {
    // Reprocesso manual: insiste mais que a fila automática para trazer
    // todos os voos, datas e valores de uma vez.
    const r = await processarPacote(p, supabaseAdmin, importInfotravelQuoteResilient, {
      tentativas: 5,
      esperaMs: 4000,
    });

    res.processados += 1;
    if (r === "ok") res.ok++;
    else res.erros++;
  }
  return res;
}

