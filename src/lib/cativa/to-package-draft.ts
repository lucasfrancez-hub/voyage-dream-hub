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

const IATA_CITY: Record<string, string> = {
  GRU: "São Paulo", CGH: "São Paulo", VCP: "Campinas",
  GIG: "Rio de Janeiro", SDU: "Rio de Janeiro",
  BSB: "Brasília", CNF: "Belo Horizonte", PLU: "Belo Horizonte",
  CWB: "Curitiba", POA: "Porto Alegre", FLN: "Florianópolis",
  SSA: "Salvador", REC: "Recife", FOR: "Fortaleza", NAT: "Natal",
  MCZ: "Maceió", AJU: "Aracaju", THE: "Teresina", SLZ: "São Luís",
  BEL: "Belém", MAO: "Manaus", MGF: "Maringá", LDB: "Londrina",
  CGB: "Cuiabá", CGR: "Campo Grande", GYN: "Goiânia", VIX: "Vitória",
  IGU: "Foz do Iguaçu", NVT: "Navegantes", JPA: "João Pessoa",
  PMW: "Palmas", MCP: "Macapá", PVH: "Porto Velho", RBR: "Rio Branco",
  BVB: "Boa Vista", STM: "Santarém", PNZ: "Petrolina", IOS: "Ilhéus",
  BPS: "Porto Seguro", JJD: "Jericoacoara", JOI: "Joinville", XAP: "Chapecó",
  MIA: "Miami", MCO: "Orlando", JFK: "Nova York", LGA: "Nova York", EWR: "Newark",
  LAX: "Los Angeles", SFO: "São Francisco", ORD: "Chicago", IAH: "Houston",
  DFW: "Dallas", ATL: "Atlanta", BOS: "Boston", LAS: "Las Vegas",
  LIS: "Lisboa", OPO: "Porto", MAD: "Madri", BCN: "Barcelona",
  CDG: "Paris", ORY: "Paris", LHR: "Londres", LGW: "Londres",
  FCO: "Roma", MXP: "Milão", FRA: "Frankfurt", MUC: "Munique",
  AMS: "Amsterdã", ZRH: "Zurique", GVA: "Genebra",
  EZE: "Buenos Aires", AEP: "Buenos Aires", SCL: "Santiago", LIM: "Lima",
  BOG: "Bogotá", MEX: "Cidade do México", CUN: "Cancún",
  DXB: "Dubai", DOH: "Doha", IST: "Istambul", CCP: "Concepción",
};

const cidadeDe = (iata: unknown, fallback?: unknown) => {
  const dado = String(fallback ?? "").trim();
  if (dado) return dado;
  const k = String(iata ?? "").toUpperCase().trim();
  return IATA_CITY[k] ?? "";
};

/** ISO da operadora → valor aceito pelo input datetime-local (YYYY-MM-DDTHH:mm). */
const dataHora = (v: unknown): string | undefined => {
  const t = String(v ?? "").trim();
  if (!t) return undefined;
  const m = t.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  if (m) return `${m[1]}T${m[2]}`;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return undefined;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** Interpreta o texto de bagagem da operadora nas 3 caixinhas do cadastro. */
function bagagens(textos: string[]) {
  const t = textos.join(" · ").toLowerCase();
  const semDespachada = /(sem|n[aã]o inclui|no)\s+(bagagem\s+)?(despachada|checked)/.test(t) || /0\s*(pc|pe[çc]a|bagagem despachada)/.test(t);
  const despachada =
    !semDespachada &&
    /(despachad|checked|\b\d+\s*(pc|pe[çc]as?)\b|\b(1|2|3)\s*x?\s*\d{2}\s*kg)/.test(t);
  const mao = /(m[aã]o|carry[- ]?on|bordo)/.test(t);
  const pessoal = /(pessoal|personal item|mochila|under seat)/.test(t);
  return {
    personal_item: pessoal || mao || despachada,
    carry_on: mao || despachada,
    checked_bag: despachada,
  };
}

/** Cabine da operadora ("ECONOMIC") → rótulo do cadastro. */
function cabine(v: unknown): string | undefined {
  const t = String(v ?? "").toUpperCase().trim();
  if (!t) return undefined;
  if (/FIRST|PRIMEIRA/.test(t)) return "Primeira Classe";
  if (/BUSINESS|EXECUT/.test(t)) return "Executiva";
  if (/PREMIUM/.test(t)) return "Premium Economy";
  if (/ECONOM|COACH|TURIST/.test(t)) return "Econômica";
  return undefined;
}

/** Marca tarifária por cia, deduzida da bagagem quando a operadora não informa. */
function marcaTarifaria(iata: string | undefined, temDespachada: boolean): string {
  const cia = String(iata ?? "").toUpperCase();
  const tabela: Record<string, [string, string]> = {
    LA: ["Light", "Plus"],
    G3: ["Light", "Max"],
    AD: ["Azul Basic", "Mais Azul"],
    AV: ["Basic", "Classic"],
    CM: ["Economy Basic", "Economy Classic"],
    AA: ["Basic Economy", "Main Cabin"],
    UA: ["Basic Economy", "Economy"],
    DL: ["Basic Economy", "Main Cabin"],
    TP: ["Basic", "Classic"],
    AF: ["Light", "Standard"],
    KL: ["Light", "Standard"],
    IB: ["Basic", "Classic"],
  };
  const par = tabela[cia] ?? ["Light", "Standard"];
  return temDespachada ? par[1]! : par[0]!;
}

function mapFlight(f: any) {
  if (!f) return null;
  const segs = Array.isArray(f.segments) ? f.segments : [];
  const first = segs[0] ?? {};
  const last = segs[segs.length - 1] ?? first;
  const textosBagagem = segs.map((s: any) => String(s?.baggage ?? "")).filter(Boolean);
  const bags = bagagens(textosBagagem);
  const ciaIata = String(first.airlineIata ?? f.airlineIata ?? "").toUpperCase() || undefined;
  const fareClass =
    String(first.fareClass ?? "").trim() || marcaTarifaria(ciaIata, bags.checked_bag);

  return {
    airline: f.airline ?? first.airline ?? undefined,
    flight_number: first.flightNumber ?? undefined,
    from_iata: f.fromIata ?? first.fromIata ?? undefined,
    from_city: cidadeDe(f.fromIata ?? first.fromIata, first.fromCity) || undefined,
    to_iata: f.toIata ?? last.toIata ?? undefined,
    to_city: cidadeDe(f.toIata ?? last.toIata, last.toCity) || undefined,
    depart_at: dataHora(f.departure ?? first.departure),
    arrive_at: dataHora(f.arrival ?? last.arrival),
    duration: f.duration ?? undefined,
    stops: typeof f.stops === "number" ? f.stops : segs.length ? segs.length - 1 : 0,
    cabin_class: cabine(first.cabin ?? f.cabin),
    fare_class: fareClass || undefined,
    ...bags,
    baggage_text: textosBagagem.length ? [...new Set(textosBagagem)].join(" · ") : undefined,
    segments: segs.map((s: any, i: number) => ({
      airline: s.airline ?? undefined,
      flight_number: s.flightNumber ?? undefined,
      from_iata: s.fromIata ?? undefined,
      from_city: cidadeDe(s.fromIata, s.fromCity) || undefined,
      to_iata: s.toIata ?? undefined,
      to_city: cidadeDe(s.toIata, s.toCity) || undefined,
      depart_at: dataHora(s.departure),
      arrive_at: dataHora(s.arrival),
      duration: s.duration ?? undefined,
      cabin_class: cabine(s.cabin),
      fare_class: s.fareClass ? String(s.fareClass) : fareClass || undefined,
      aircraft: s.aircraft ?? undefined,
      baggage: s.baggage ?? undefined,
      // conexão: tempo de espera até o próximo trecho
      layover: i < segs.length - 1 ? conexao(s.arrival, segs[i + 1]?.departure) : undefined,
    })),
  };
}


/** "2h 15min" entre a chegada de um trecho e a partida do seguinte. */
function conexao(chegada: unknown, partida: unknown): string | undefined {
  const a = new Date(String(chegada ?? "")).getTime();
  const b = new Date(String(partida ?? "")).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return undefined;
  const min = Math.round((b - a) / 60000);
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h${m ? ` ${m}min` : ""}` : `${m}min`;
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
  let t = limpo(v)
    .replace(/leia\s+atentamente\s+a\s+descri[cç][aã]o\s+do\s+servi[cç]o/gi, " ")
    .replace(/^[\s•\-–—:*]+/, "")
    .replace(/\s+/g, " ")
    .trim();
  // fica só com a primeira frase / primeiro rótulo
  t = t.split(/[.;]\s+|\s+\|\s+/)[0] ?? t;
  // remove parênteses longos e sobras de pontuação
  t = t
    .replace(/\([^)]{25,}\)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (t.length > 60) {
    const corte = t.slice(0, 60);
    const p = corte.lastIndexOf(" ");
    t = p > 25 ? corte.slice(0, p) : corte;
  }
  return t.replace(/[.,;:–-]+$/, "").trim();
}


/** Limpa HTML/entidades do texto da operadora. */
function limpo(v: unknown): string {
  return String(v ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Quebra o texto do serviço em blocos ("➡️ TRANSFER IN: …", "➡️ TICKET …"). */
function blocos(desc: string): string[] {
  return desc
    .split(/➡️|➔|\u27A1/g)
    .map((b) => limpo(b))
    .filter((b) => b.length > 8);
}

const RE_COMERCIAL =
  /(forma[s]?\s+de\s+pagamento|parcelamento|sem\s+juros|cart[aã]o\s+de\s+cr[eé]dito|dep[oó]sito|pix\b|multicr[eé]dito|negativa[cç][aã]o|pre[cç]os?\s+calculados|sujeit[ao]s?\s+a\s+.*reajuste|tarifas?\s+dispon[ií]veis|parcela\s+m[ií]nima)/i;

const eComercial = (t: string) => RE_COMERCIAL.test(t);

type ItemServico = { nome: string; descricao: string; total: number | null };

/** Serviços adicionais (transfers, ingressos, passeios, seguro, outros) da opção. */
function servicosDaOpcao(detalhes: any) {
  const lista = (v: any): ItemServico[] =>
    (Array.isArray(v) ? v : [])
      .map((i: any) => ({
        nome: limpo(i?.name),
        descricao: limpo(i?.description),
        total: typeof i?.total === "number" ? i.total : null,
      }))
      .filter((i) => i.nome || i.descricao);

  const resumoIA: ServicoResumidoIA[] = Array.isArray(detalhes?.resumo_ia) ? detalhes.resumo_ia : [];

  const transfers = lista(detalhes?.transfers);
  const tickets = lista(detalhes?.tickets);
  const activities = lista(detalhes?.activities);
  const insurance = lista(detalhes?.insurance);
  const genericos = lista(detalhes?.services);

  // Serviços "combo" da operadora podem conter transfer + ingresso no mesmo item:
  // separa em blocos e distribui para o bloco certo do cadastro.
  const detTransfer: string[] = transfers.map((t) => [t.nome, t.descricao].filter(Boolean).join(" — "));
  const detTickets: string[] = tickets.map((t) => [t.nome, t.descricao].filter(Boolean).join(" — "));
  const detPasseios: string[] = activities.map((t) => [t.nome, t.descricao].filter(Boolean).join(" — "));
  const detSeguro: string[] = insurance.map((t) => [t.nome, t.descricao].filter(Boolean).join(" — "));
  const outros: string[] = [];
  const outrosDetalhe: string[] = [];

  for (const g of genericos) {
    const partes = blocos(g.descricao);
    const alvo = partes.length ? partes : [g.descricao].filter(Boolean);
    let classificado = false;
    for (const p of alvo) {
      const ref = `${g.nome} ${p}`;
      // o rótulo do bloco (início do texto) manda na classificação
      const rotulo = p.slice(0, 60);
      if (/ticket|ingresso|bustour|bus tour|park|entrada/i.test(rotulo)) {
        detTickets.push(p);
        classificado = true;
      } else if (/transfer|traslado|transporte/i.test(rotulo)) {
        detTransfer.push(p);
        classificado = true;
      } else if (/city ?tour|passeio|excurs[aã]o|visita/i.test(rotulo)) {
        detPasseios.push(p);
        classificado = true;
      } else if (/seguro|cobertura|assist[eê]ncia/i.test(rotulo)) {
        detSeguro.push(p);
        classificado = true;
      } else if (/transfer|traslado|transporte/i.test(ref)) {
        detTransfer.push(p);
        classificado = true;
      } else if (/seguro|cobertura|assist[eê]ncia/i.test(ref)) {
        detSeguro.push(p);
        classificado = true;
      }
    }

    if (!classificado) {
      outros.push(nomeCurto(g.nome || g.descricao));
      if (g.descricao) outrosDetalhe.push(`${g.nome || "Serviço"} — ${g.descricao}`);
    }
  }

  const services: Record<string, any> = {};
  if (detTransfer.length) {
    services.transfer = {
      enabled: true,
      sentido: "in_out",
      pickup_points: detTransfer.join("\n\n"),
    };
  }
  if (detTickets.length) {
    services.tickets = { enabled: true, parks: detTickets.map((t) => nomeCurto(t)) };
  }
  if (detPasseios.length) {
    services.passeios = detPasseios.map((t) => nomeCurto(t));
    services.city_tour = { enabled: true, detalhe: detPasseios.join("\n\n") };
  }
  if (detSeguro.length) {
    const moeda = /R\$|BRL/i.test(detSeguro.join(" ")) ? "BRL" : "USD";
    services.seguro = { enabled: true, cobertura: detSeguro.join("\n\n"), moeda };
  }
  if (outros.length) services.outros = outros;

  // Detalhe por serviço: o cliente vê só o título na lista e abre para ler tudo.
  const detalhesPorServico = [
    ...detTransfer.map((t) => ({ grupo: "Transfer", texto: t })),
    ...detTickets.map((t) => ({ grupo: "Ingressos", texto: t })),
    ...detPasseios.map((t) => ({ grupo: "Passeios", texto: t })),
    ...detSeguro.map((t) => ({ grupo: "Seguro", texto: t })),
    ...outrosDetalhe.map((t) => ({ grupo: "Outros serviços", texto: t })),
  ]
    .map(({ grupo, texto }) => ({ grupo, titulo: nomeCurto(texto), detalhe: texto.trim() }))
    .filter((i) => i.titulo && i.detalhe && i.detalhe.length > i.titulo.length - 2);
  if (detalhesPorServico.length) services.service_details = detalhesPorServico;


  const nomesCurtos = [
    ...detTransfer,
    ...detTickets,
    ...detPasseios,
    ...detSeguro,
    ...outros,
  ].map((t) => nomeCurto(t));

  const destaques = [...new Set(resumoIA.flatMap((r) => r.destaques ?? []).map((s) => s.trim()).filter(Boolean))];
  // Observações: só o que interessa ao viajante — condições comerciais entram fora do roteiro.
  const observacoes = [
    ...new Set(
      [
        ...resumoIA.flatMap((r) => r.observacoes ?? []),
        ...(Array.isArray(detalhes?.notes) ? detalhes.notes : []),
      ]
        .map((s: unknown) => limpo(s))
        .filter(Boolean)
        .filter((s) => !eComercial(s)),
    ),
  ];
  const resumoTexto = resumoIA
    .map((r) => [r.nome ? `${r.nome}` : "", r.resumo].filter(Boolean).join(" — "))
    .filter(Boolean)
    .join("\n");

  // Roteiro montado a partir dos serviços realmente contratados.
  const roteiro = [
    detTransfer.length ? `Chegada\n${detTransfer.map((t) => `• ${t}`).join("\n")}` : "",
    detPasseios.length ? `Durante a viagem\n${detPasseios.map((t) => `• ${t}`).join("\n")}` : "",
    detTickets.length ? `Ingressos e passeios inclusos\n${detTickets.map((t) => `• ${t}`).join("\n")}` : "",
    outrosDetalhe.length ? `Outros serviços\n${outrosDetalhe.map((t) => `• ${t}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    services,
    todos: nomesCurtos,
    destaques,
    observacoes,
    resumoTexto,
    roteiro,
  };
}


/** Regime da operadora → rótulo do cadastro. */
function regime(v: unknown): string {
  const t = limpo(v).toLowerCase();
  if (!t) return "";
  if (/all\s*inclusive|tudo\s*inclu/.test(t)) return "All inclusive";
  if (/pens[aã]o\s*completa|full\s*board/.test(t)) return "Pensão completa";
  if (/meia\s*pens[aã]o|half\s*board/.test(t)) return "Meia pensão";
  if (/caf[eé]/.test(t)) return "Café da manhã";
  if (/sem\s*refei|room\s*only|apenas\s*hospedagem/.test(t)) return "Sem refeições";
  return limpo(v);
}

/** Tipo de cama deduzido da descrição do quarto. */
function tipoCama(v: string): string {
  const t = v.toLowerCase();
  if (/quadrupl|qu[aá]drupl/.test(t)) return "Quádruplo";
  if (/tripl/.test(t)) return "Triplo";
  if (/casal|double|matrimonial|king|queen/.test(t)) return "Casal";
  if (/twin|duas camas|2 camas|solteiro/.test(t)) return "Solteiro (twin)";
  if (/individual|single/.test(t)) return "Individual";
  return "";
}

/** Descrição do quarto sem as cláusulas de multa/penalização da operadora. */
function descricaoQuarto(v: unknown): string {
  return limpo(v)
    .split(/—|–| - a partir de /i)
    .map((p) => p.trim())
    .filter((p) => p && !/penaliza|multa|a partir de \d/i.test(p))
    .join(" - ")
    .trim();
}

/** Categoria do quarto (parte antes do tipo de cama/vista). */
function categoriaQuarto(desc: string): string {
  if (!desc) return "";
  const semCama = desc
    .replace(/\b(casal|double|matrimonial|king|queen|twin|solteiro|tripl\w*|quadrupl\w*|individual|single)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[-–,]\s*$/, "")
    .trim();
  return semCama || desc;
}

function hotelDaOpcao(op: CativaVooRow | null, pacote: CativaPacoteRow) {
  const h = (op?.hoteis ?? [])[0];
  if (h) {
    const desc = descricaoQuarto(h.roomDescription);
    return {
      hotel_name: String(h.name ?? "").trim(),
      room_type: desc,
      room_category: categoriaQuarto(desc),
      bed_type: tipoCama(desc),
      meal_plan: regime(h.board),
      checkin: dia(h.checkin),
      checkout: dia(h.checkout),
    };
  }
  const p = (pacote.hoteis ?? [])[0];
  const descP = descricaoQuarto(p?.quarto ?? p?.categoria ?? "");
  return {
    hotel_name: p ? String(p.nome ?? "").trim() : "",
    room_type: descP,
    room_category: categoriaQuarto(descP),
    bed_type: tipoCama(descP),
    meal_plan: regime(p?.regime),
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
    d.room_category = h.room_category;
    d.bed_type = h.bed_type;
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

    const { services, todos, destaques, observacoes, resumoTexto, roteiro } = servicosDaOpcao(
      principal.detalhes,
    );
    d.services = services;
    const bullets = destaques.length ? destaques : todos;
    if (bullets.length) d.includes = [...new Set([...(d.includes as string[]), ...bullets])];
    if (resumoTexto) d.summary = [d.summary, resumoTexto].filter(Boolean).join("\n\n").trim();
    if (roteiro) d.itinerary = [d.itinerary, roteiro].filter(Boolean).join("\n\n").trim();
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
          room_category: ho.room_category,
          bed_type: ho.bed_type,
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
      d.room_category = maisBarato.room_category;
      d.bed_type = maisBarato.bed_type;
      d.meal_plan = maisBarato.meal_plan;
      if (maisBarato.price_per_person) d.price_per_person = maisBarato.price_per_person;
    }

    d.cativa_alternativas = opcoes.length;
    drafts.push(d);
  }


  return drafts.sort((a, b) => String(a.going_date).localeCompare(String(b.going_date)));
}
