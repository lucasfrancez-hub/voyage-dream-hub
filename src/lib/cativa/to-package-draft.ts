// Converte um pacote do catálogo Cativa (+ opções de voo da Infotravel)
// em rascunhos no formato do cadastro de pacotes VIA AIR.
// Browser-safe: sem imports de servidor.

export type CativaVooRow = {
  id: string;
  opcao_numero: number;
  label: string | null;
  companhia: string | null;
  total: number | null;
  moeda: string | null;
  voos: any[] | null;
  hoteis: any[] | null;
  detalhes: any | null;
};

export type CativaPacoteRow = {
  id: string;
  fonte: string;
  categoria: string | null;
  nome: string;
  origem_iata: string | null;
  origem_cidade: string | null;
  destino: string | null;
  data_viagem: string | null;
  data_fim: string | null;
  noites: number | null;
  aereo_por: number | null;
  taxas: number | null;
  valor_total: number | null;
  hoteis: any[] | null;
  ingressos: any[] | null;
  incluso: string[] | null;
  observacao: string | null;
  link_orcamento: string | null;
};

export type CativaDraft = Record<string, any> & {
  cativa_pacote_id: string;
  cativa_opcao?: number | null;
  cativa_datas_label: string;
};

const dia = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : null);

function noitesEntre(inicio: string | null, fim: string | null): number | null {
  if (!inicio || !fim) return null;
  const a = new Date(`${inicio}T12:00:00`).getTime();
  const b = new Date(`${fim}T12:00:00`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
  return Math.round((b - a) / 86400000);
}

function slugify(v: string) {
  return v
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function mapFlight(f: any) {
  if (!f) return null;
  const segs = Array.isArray(f.segments) ? f.segments : [];
  const first = segs[0] ?? {};
  const last = segs[segs.length - 1] ?? first;
  return {
    airline: f.airline ?? first.airline ?? undefined,
    flight_number: first.flightNumber ?? undefined,
    from_iata: f.fromIata ?? first.fromIata ?? undefined,
    to_iata: f.toIata ?? last.toIata ?? undefined,
    depart_at: f.departure ?? first.departure ?? undefined,
    arrive_at: f.arrival ?? last.arrival ?? undefined,
    duration: f.duration ?? undefined,
    stops: typeof f.stops === "number" ? f.stops : segs.length ? segs.length - 1 : 0,
    cabin_class: first.cabin ?? undefined,
    segments: segs.map((s: any) => ({
      airline: s.airline ?? undefined,
      flight_number: s.flightNumber ?? undefined,
      from_iata: s.fromIata ?? undefined,
      to_iata: s.toIata ?? undefined,
      depart_at: s.departure ?? undefined,
      arrive_at: s.arrival ?? undefined,
      duration: s.duration ?? undefined,
      cabin_class: s.cabin ?? undefined,
      aircraft: s.aircraft ?? undefined,
      baggage: s.baggage ?? undefined,
    })),
  };
}

export type ServicoResumidoIA = {
  tipo: string;
  nome: string;
  resumo: string;
  destaques: string[];
  observacoes: string[];
};

/** Nome curto e apresentável para o serviço (corta textões da operadora). */
function nomeCurto(v: unknown): string {
  const t = String(v ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length <= 90) return t;
  const corte = t.slice(0, 90);
  const p = corte.lastIndexOf(" ");
  return `${(p > 40 ? corte.slice(0, p) : corte).replace(/[.,;:–-]+$/, "")}…`;
}

/** Serviços adicionais (transfers, ingressos, passeios, seguro, outros) da opção. */
function servicosDaOpcao(detalhes: any) {
  const lista = (v: any): any[] => (Array.isArray(v) ? v : []);
  const resumoIA: ServicoResumidoIA[] = lista(detalhes?.resumo_ia);

  // quando a IA resumiu, usa o nome bonito dela no lugar do texto original
  const nomeIA = (tipo: string, original: string, ordem: number) => {
    const doTipo = resumoIA.filter((r) => r.tipo === tipo);
    const r = doTipo[ordem];
    return nomeCurto(r?.nome || original);
  };

  const nomes = (v: any, tipo: string) =>
    lista(v)
      .map((i, idx) => nomeIA(tipo, String(i?.name ?? "").trim(), idx))
      .filter(Boolean);

  const transfers = nomes(detalhes?.transfers, "Transfer");
  const tickets = nomes(detalhes?.tickets, "Ingresso");
  const activities = nomes(detalhes?.activities, "Passeio");
  const insurance = nomes(detalhes?.insurance, "Seguro / proteção");
  const outrosServicos = nomes(detalhes?.services, "Serviço");

  const services: Record<string, any> = {};
  if (transfers.length) {
    services.transfer = { enabled: true, sentido: "in_out", pickup_points: transfers.join(" · ") };
  }
  if (tickets.length) services.tickets = { enabled: true, parks: tickets };
  if (activities.length) services.passeios = activities;
  if (insurance.length) {
    services.seguro = { enabled: true, cobertura: insurance.join(" · ") };
  }
  if (outrosServicos.length) services.outros = outrosServicos;

  // bullets curtos e observações vindos do resumo da IA
  const destaques = [...new Set(resumoIA.flatMap((r) => r.destaques ?? []).map((s) => s.trim()).filter(Boolean))];
  const observacoes = [...new Set(resumoIA.flatMap((r) => r.observacoes ?? []).map((s) => s.trim()).filter(Boolean))];
  const resumoTexto = resumoIA
    .map((r) => [r.nome ? `${r.nome}` : "", r.resumo].filter(Boolean).join(" — "))
    .filter(Boolean)
    .join("\n");

  return {
    services,
    todos: [...transfers, ...tickets, ...activities, ...insurance, ...outrosServicos],
    destaques,
    observacoes,
    resumoTexto,
  };
}

function hotelDaOpcao(op: CativaVooRow | null, pacote: CativaPacoteRow) {
  const h = (op?.hoteis ?? [])[0];
  if (h) {
    return {
      hotel_name: String(h.name ?? "").trim(),
      room_type: h.roomDescription ? String(h.roomDescription) : "",
      meal_plan: h.board ? String(h.board) : "",
      checkin: dia(h.checkin),
      checkout: dia(h.checkout),
    };
  }
  const p = (pacote.hoteis ?? [])[0];
  return {
    hotel_name: p ? String(p.nome ?? "").trim() : "",
    room_type: "",
    meal_plan: p?.regime ? String(p.regime) : "",
    checkin: null as string | null,
    checkout: null as string | null,
  };
}

/**
 * Gera um rascunho por conjunto de datas.
 * Opções de voo com as MESMAS datas viram um único pacote (opções alternativas);
 * datas diferentes viram pacotes separados.
 */
export function montarDraftsCativa(pacote: CativaPacoteRow, voos: CativaVooRow[]): CativaDraft[] {
  const destino = (pacote.destino ?? "").trim();
  const origem = (pacote.origem_cidade ?? pacote.origem_iata ?? "").trim();
  const incluso = Array.isArray(pacote.incluso) ? pacote.incluso.filter(Boolean) : [];

  const base = (inicio: string | null, fim: string | null): CativaDraft => ({
    cativa_pacote_id: pacote.id,
    cativa_datas_label:
      inicio && fim ? `${inicio.split("-").reverse().join("/")} → ${fim.split("-").reverse().join("/")}` : "Datas a definir",
    slug: slugify(destino || pacote.nome || "pacote"),
    title: destino && origem ? `${destino} - Saída de ${origem}` : destino || pacote.nome,
    kind: "package",
    destination: destino,
    origin: origem,
    going_date: inicio ?? "",
    return_date: fim ?? "",
    nights: noitesEntre(inicio, fim) ?? pacote.noites ?? 0,
    base_occupancy: 2,
    price_per_person: Number(pacote.aereo_por ?? 0) || 0,
    taxes: Number(pacote.taxas ?? 0) || 0,
    supplier_name: "Cativa / Viajando com Desconto",
    summary: pacote.observacao ?? "",
    includes: incluso,
    is_active: true,
    date_mode: "fixed",
    services: {},
    outbound_flight: null,
    return_flight: null,
  });

  const grupos = new Map<string, CativaVooRow[]>();
  for (const op of voos) {
    const d = op.detalhes ?? {};
    const inicio = dia(d.startDate) ?? dia(pacote.data_viagem);
    const fim = dia(d.endDate) ?? dia(pacote.data_fim);
    const chave = `${inicio ?? "?"}|${fim ?? "?"}`;
    const atual = grupos.get(chave);
    if (atual) atual.push(op);
    else grupos.set(chave, [op]);
  }

  if (!grupos.size) {
    const d = base(dia(pacote.data_viagem), dia(pacote.data_fim));
    const h = hotelDaOpcao(null, pacote);
    d.hotel_name = h.hotel_name;
    d.meal_plan = h.meal_plan;
    return [d];
  }

  const drafts: CativaDraft[] = [];
  for (const [chave, opcoes] of grupos) {
    const [inicio, fim] = chave.split("|").map((v) => (v === "?" ? null : v));
    const principal = opcoes.slice().sort((a, b) => (a.total ?? Infinity) - (b.total ?? Infinity))[0]!;
    const d = base(inicio ?? null, fim ?? null);
    d.cativa_opcao = principal.opcao_numero;

    const h = hotelDaOpcao(principal, pacote);
    d.hotel_name = h.hotel_name;
    d.room_type = h.room_type;
    d.meal_plan = h.meal_plan;
    if (!d.going_date && h.checkin) d.going_date = h.checkin;
    if (!d.return_date && h.checkout) d.return_date = h.checkout;
    if (!d.nights) d.nights = noitesEntre(d.going_date || null, d.return_date || null) ?? 0;

    const fl = Array.isArray(principal.voos) ? principal.voos : [];
    const ida = fl.find((f: any) => String(f?.direction).toUpperCase() === "OUTBOUND") ?? fl[0] ?? null;
    const volta =
      fl.find((f: any) => String(f?.direction).toUpperCase() === "INBOUND") ??
      (fl.length > 1 ? fl[fl.length - 1] : null);
    d.outbound_flight = mapFlight(ida);
    d.return_flight = volta && volta !== ida ? mapFlight(volta) : null;

    const { services, todos, destaques, observacoes, resumoTexto } = servicosDaOpcao(principal.detalhes);
    d.services = services;
    const bullets = destaques.length ? destaques : todos;
    if (bullets.length) d.includes = [...new Set([...(d.includes as string[]), ...bullets])];
    if (resumoTexto) d.summary = [d.summary, resumoTexto].filter(Boolean).join("\n\n").trim();
    if (observacoes.length) {
      d.itinerary = [d.itinerary, `Importante:\n${observacoes.map((o) => `• ${o}`).join("\n")}`]
        .filter(Boolean)
        .join("\n\n")
        .trim();
    }
    if (typeof principal.total === "number" && !d.price_per_person) {
      d.price_per_person = Math.round((principal.total / 2) * 100) / 100;
    }

    // Opções de hospedagem: mesmos voos/datas, hotéis diferentes.
    // O mais barato vem selecionado por padrão (índice 0).
    const ocupacao = Number(d.base_occupancy) || 2;
    const vistos = new Set<string>();
    const hoteis = opcoes
      .slice()
      .sort((a, b) => (a.total ?? Infinity) - (b.total ?? Infinity))
      .map((op) => {
        const ho = hotelDaOpcao(op, pacote);
        if (!ho.hotel_name) return null;
        const chaveHotel = `${ho.hotel_name}|${ho.room_type}`.toLowerCase();
        if (vistos.has(chaveHotel)) return null;
        vistos.add(chaveHotel);
        const total = typeof op.total === "number" ? op.total : null;
        return {
          opcao: op.opcao_numero,
          hotel_name: ho.hotel_name,
          room_type: ho.room_type,
          meal_plan: ho.meal_plan,
          price_per_person: total != null ? Math.round((total / ocupacao) * 100) / 100 : Number(d.price_per_person) || 0,
          total,
        };
      })
      .filter(Boolean) as Array<Record<string, any>>;

    if (hoteis.length > 1) {
      d.hotel_options = hoteis;
      const maisBarato = hoteis[0]!;
      d.hotel_name = maisBarato.hotel_name;
      d.room_type = maisBarato.room_type;
      d.meal_plan = maisBarato.meal_plan;
      if (maisBarato.price_per_person) d.price_per_person = maisBarato.price_per_person;
    }

    d.cativa_alternativas = opcoes.length;
    drafts.push(d);
  }


  return drafts.sort((a, b) => String(a.going_date).localeCompare(String(b.going_date)));
}
