// Converte um pacote do catálogo Cativa (+ opções de voo da Infotravel)
// em rascunhos no formato do cadastro de pacotes VIA AIR.
// Browser-safe: sem imports de servidor.

import { gerarRoteiro } from "@/lib/packages/itinerary";



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

/** Remove código IATA do nome da cidade: "Recife (REC)" → "Recife"; "REC" → cidade conhecida. */
const semIata = (v: unknown): string => {
  let t = String(v ?? "").trim();
  if (/^[A-Z]{3}$/.test(t)) return IATA_CITY[t] ?? t;
  t = t
    .replace(/\s*[\(\[\{]\s*[A-Za-z]{3}\s*[\)\]\}]/g, "")
    .replace(/\s*[-–—/]\s*[A-Z]{3}\b/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return t;
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
  // fica só com o nome/rótulo; tudo após travessão costuma ser descrição.
  t = t.split(/\s+[—–]\s+|[.;]\s+|\s+\|\s+/)[0] ?? t;
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

const RE_RUIDO_SERVICO =
  /programa de flexibilidade tarif[aá]ria|isen[cç][aã]o de multa|cr[eé]dito para nova viagem|voucher\)? no valor|cobre impedimentos|v[aá]lido para pacotes e servi[cç]os|cancelamento eleg[ií]vel/i;

/** Converte textos da planilha/API em um único nome público, sem regras operacionais. */
function nomePublicoServico(v: unknown): string {
  const original = limpo(v);
  if (!original || RE_RUIDO_SERVICO.test(original)) return "";
  if (/passage[mn].*a[eé]rea|a[eé]re[oa]\b|consulte\s+voos/i.test(original)) return "Passagem aérea";
  if (/hospedagem|di[aá]rias?|noites?\s/i.test(original)) return "Hospedagem";

  let nome = nomeCurto(original)
    .replace(/\s*[-–—]\s*frequ[eê]ncia\s*:.*$/i, "")
    .replace(/\s*\([^)]{1,8}\)\s*$/i, "")
    .replace(/\s+\d+\s*$/, "")
    .trim();
  return nome;
}

/** Remove marcações de cortesia ("grátis", "*GRÁTIS*", "free"). */
function semGratis(s: string): string {
  return s
    .replace(/[*_]*\b(gr[áa]tis|free|cortesia)\b[*_]*/gi, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,;:\-–—]+|[\s,;:\-–—]+$/g, "")
    .trim();
}

/** Ordem de exibição: aéreo → hospedagem → transfer → passeios → ingressos → resto. */
function ordemServico(s: string): number {
  const t = s.toLowerCase();
  if (/passagem a[eé]rea|a[eé]reo/.test(t)) return 0;
  if (/hospedagem|di[aá]ria/.test(t)) return 1;
  if (/transfer|traslado|translado/.test(t)) return 2;
  if (/passeio|city\s*tour|tour|excurs[aã]o/.test(t)) return 3;
  if (/ingresso|ticket|entrada para/.test(t)) return 4;
  return 5;
}

/** Tokens significativos do serviço (para detectar repetição do mesmo atrativo). */
function tokensServico(s: string): Set<string> {
  const stop = new Set([
    "de","da","do","das","dos","a","o","e","com","sem","para","por","em","no","na","the",
    "passeio","ingresso","ticket","entrada","combo","tour","city","visita","incluso","inclusa",
    "transfer","traslado","translado","ida","volta","aeroporto","hotel","praia","parque",
  ]);
  return new Set(
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(" ")
      .filter((w) => w.length > 2 && !stop.has(w)),
  );
}

/** Chave para deduplicar serviços parecidos (ex.: dois "Transfer In + Out"). */
function chaveServico(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 6)
    .join(" ");
}

/**
 * Deduplica (inclusive quando o mesmo atrativo aparece como passeio e solto),
 * remove marcações de "grátis", aplica o regime de alimentação na hospedagem
 * e ordena: aéreo → hospedagem → transfer → passeios → ingressos → resto.
 */
function ajustarInclusos(lista: string[], regimeAtual?: string | null): string[] {
  const visto = new Set<string>();
  const out: string[] = [];
  for (const raw of lista) {
    let item = semGratis(String(raw ?? "").trim());
    if (!item) continue;
    if (/hospedagem|di[aá]rias?\b|consulte\s+o?\s*regime/i.test(item)) {
      const r = (regimeAtual ?? "").trim();
      item = r && !/sem refei/i.test(r) ? `Hospedagem com ${r.toLowerCase()}` : "Hospedagem";
    }
    const k = chaveServico(item);
    if (!k || visto.has(k)) continue;

    // Mesmo atrativo repetido (ex.: "Passeio a Praia do Gunga" e "Praia do Gunga",
    // "Ingresso para Pratagy Acqua Park" e "Pratagy Acqua Park"): fica o mais completo.
    const toks = tokensServico(item);
    if (toks.size) {
      let repetido = false;
      for (let i = 0; i < out.length; i++) {
        const anteriores = tokensServico(out[i]!);
        if (!anteriores.size) continue;
        const contidoNoAnterior = [...toks].every((t) => anteriores.has(t));
        const contemAnterior = [...anteriores].every((t) => toks.has(t));
        if (contidoNoAnterior) {
          repetido = true;
          break;
        }
        if (contemAnterior) {
          out[i] = item; // o novo é mais descritivo
          repetido = true;
          break;
        }
      }
      if (repetido) continue;
    }

    visto.add(k);
    out.push(item);
  }
  return out
    .map((s, i) => ({ s, i }))
    .sort((a, b) => ordemServico(a.s) - ordemServico(b.s) || a.i - b.i)
    .map((x) => x.s);
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
  const detTransfer: string[] = transfers.map((t) => t.nome || t.descricao);
  const detTickets: string[] = tickets.map((t) => t.nome || t.descricao);
  const detPasseios: string[] = activities.map((t) => t.nome || t.descricao);
  const detSeguro: string[] = insurance.map((t) => t.nome || t.descricao);
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
      outros.push(nomePublicoServico(g.nome || g.descricao));
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
  ].map((t) => nomePublicoServico(t)).filter(Boolean);

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

  return {
    services,
    todos: nomesCurtos,
    destaques,
    observacoes,
    resumoTexto,
    temTransfer: detTransfer.length > 0,
    passeios: detPasseios.map((t) => nomeCurto(t)),
    ingressos: detTickets.map((t) => nomeCurto(t)),
  };

}


/** Regime da operadora → rótulo do cadastro. */
function regime(v: unknown): string {
  const t = limpo(v).toLowerCase();
  if (!t) return "";
  // códigos curtos das operadoras (IA/AI = inclusive all, CM = café, MP, PC, SA)
  const cod = t.replace(/[^a-z]/g, "");
  if (cod === "ia" || cod === "ai" || cod === "ti") return "All inclusive";
  if (cod === "pc" || cod === "fb") return "Pensão completa";
  if (cod === "mp" || cod === "hb") return "Meia pensão";
  if (cod === "cm" || cod === "ca" || cod === "bb") return "Café da manhã";
  if (cod === "sa" || cod === "ro") return "Sem refeições";
  if (/all\s*inclusive|tudo\s*inclu/.test(t)) return "All inclusive";
  if (/pens[aã]o\s*completa|full\s*board/.test(t)) return "Pensão completa";
  if (/meia\s*pens[aã]o|half\s*board/.test(t)) return "Meia pensão";
  if (/caf[eé]/.test(t)) return "Café da manhã";
  if (/sem\s*refei|room\s*only|apenas\s*hospedagem/.test(t)) return "Sem refeições";
  return limpo(v);
}

/** Tipo de cama normalizado para as opções do cadastro. */
function tipoCama(v: string): string {
  const t = v.toLowerCase();
  if (/2\s*camas?\s*queen|duas\s*camas?\s*queen/.test(t)) return "2 camas queen";
  if (/2\s*camas?\s*de\s*casal|duas\s*camas?\s*de\s*casal/.test(t)) return "2 camas de casal";
  if (/3\s*camas?\s*de\s*solteiro|tr[eê]s\s*camas?\s*de\s*solteiro|tripl/.test(t)) return "3 camas de solteiro";
  if (/casal\s*\+\s*2\s*solteir|casal\s*e\s*2\s*solteir/.test(t)) return "1 casal + 2 solteiros";
  if (/casal\s*\+\s*(1\s*)?solteir|casal\s*e\s*(1\s*)?solteir/.test(t)) return "1 casal + 1 solteiro";
  if (/sof[aá]\s*-?\s*cama/.test(t)) return "Cama de casal + sofá-cama";
  if (/twin|2\s*camas?\s*de\s*solteiro|duas\s*camas?\s*de\s*solteiro|2\s*camas?\s*solteiro/.test(t))
    return "2 camas de solteiro";
  if (/king/.test(t)) return "1 cama king";
  if (/queen/.test(t)) return "1 cama queen";
  if (/casal|double|matrimonial/.test(t)) return "1 cama de casal";
  if (/solteiro|individual|single/.test(t)) return "2 camas de solteiro";
  return "";
}

/** Tipo de quarto normalizado para as opções do cadastro. */
function tipoQuarto(desc: string): string {
  const t = (desc || "").toLowerCase();
  if (!t) return "";
  if (/presidencial/.test(t)) return "Suíte Presidencial";
  if (/master/.test(t)) return "Suíte Master";
  if (/su[ií]te|suite/.test(t)) return "Suíte";
  if (/bangal[oô]|bungalow/.test(t)) return "Bangalô";
  if (/chal[eé]/.test(t)) return "Chalé";
  if (/luxo|deluxe|de luxe|luxury/.test(t)) return "Luxo";
  if (/superior/.test(t)) return "Superior";
  if (/standard|standart|cl[aá]ssico|classic/.test(t)) return "Standard";
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

/** Categoria / vista do quarto — só preenche quando a vista está explícita. */
function categoriaQuarto(desc: string): string {
  const t = (desc || "").toLowerCase();
  if (!t) return "";
  if (/frente\s*(ao\s*)?mar|beach\s*front|ocean\s*front/.test(t)) return "Frente mar";
  if (/vista\s*parcial\s*(ao\s*)?mar|parcial\s*mar/.test(t)) return "Vista parcial mar";
  if (/vista\s*(para\s*o\s*)?mar|ocean\s*view|sea\s*view/.test(t)) return "Vista mar";
  if (/vista\s*piscina|pool\s*view/.test(t)) return "Vista piscina";
  if (/vista\s*jardim|garden\s*view/.test(t)) return "Vista jardim";
  if (/vista\s*cidade|city\s*view/.test(t)) return "Vista cidade";
  if (/vista\s*montanha|mountain\s*view/.test(t)) return "Vista montanha";
  if (/vista\s*interna|interior/.test(t)) return "Vista interna";
  return "";
}


/** Ocupação real do orçamento (o total da Infotravel é do grupo todo). */
function paxDaOpcao(op: CativaVooRow | null): number {
  const pax = (op?.detalhes as any)?.pax;
  const n = (Number(pax?.adults) || 0) + (Number(pax?.children) || 0);
  return n > 0 ? n : 2;
}

/**
 * Roteiro com mais de uma hospedagem (ex.: 2 noites em Salvador + 2 em Morro de São Paulo).
 * Cada estadia é sequencial (check-in/check-out diferentes), não é alternativa de hotel.
 */
function estadiasDaOpcao(op: CativaVooRow | null) {
  const lista = Array.isArray(op?.hoteis) ? (op!.hoteis as any[]) : [];
  return lista
    .map((h) => {
      const nome = String(h?.name ?? "").replace(/[,\s]+$/, "").trim();
      if (!nome) return null;
      const desc = descricaoQuarto(h?.roomDescription);
      const checkin = dia(h?.checkin);
      const checkout = dia(h?.checkout);
      return {
        hotel_name: nome,
        room_type: tipoQuarto(desc),
        room_category: categoriaQuarto(desc),
        bed_type: tipoCama(desc),
        meal_plan: regime(h?.board),
        checkin,
        checkout,
        nights: Number(h?.nights) || noitesEntre(checkin, checkout) || null,
        address: String(h?.address ?? "").trim() || null,
        photo: Array.isArray(h?.photos) ? (h.photos[0] ?? null) : null,
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => String(a.checkin ?? "").localeCompare(String(b.checkin ?? ""))) as Array<Record<string, any>>;
}

function hotelDaOpcao(op: CativaVooRow | null, pacote: CativaPacoteRow) {
  const h = (op?.hoteis ?? [])[0];
  if (h) {
    const desc = descricaoQuarto(h.roomDescription);
    return {
      hotel_name: String(h.name ?? "").trim(),
      room_type: tipoQuarto(desc),
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
    room_type: tipoQuarto(descP),
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
  const nomePacote = limpo(pacote.nome);
  const destinoFonte = (pacote.destino ?? "").trim();
  const hotelFonte = (pacote.hoteis ?? [])[0] as Record<string, unknown> | undefined;
  const destinoHotel = limpo(hotelFonte?.cidade ?? hotelFonte?.city ?? hotelFonte?.localidade);
  const destinoTitulo = nomePacote
    .match(/\bem\s+(.+?)(?=\s+com\s+|\s+[—–|-]\s+|$)/i)?.[1]
    ?.replace(/\b(resort|hotel|pousada)\b.*$/i, "")
    .trim();
  // O aeroporto de chegada (ex.: Recife) não substitui o destino real do pacote
  // (ex.: Porto de Galinhas). Cidade do hotel e nome comercial têm prioridade.
  const destino = semIata(destinoHotel || destinoTitulo || destinoFonte);
  const origem = semIata((pacote.origem_cidade ?? pacote.origem_iata ?? "").trim());
  const incluso = Array.isArray(pacote.incluso)
    ? [...new Set(pacote.incluso.map(nomePublicoServico).filter(Boolean))]
    : [];

  // Título padronizado: "<núcleo do pacote> - Saindo de <origem>".
  // Ex.: "Europa: Réveillon 2027 em Madri com aéreo" -> "Réveillon 2027 em Madri"
  //      "Maceió com Praias do Gunga, Francês & Pratagy Acqua Park GRÁTIS" -> "Maceió"
  const nucleo = (() => {
    let t = nomePacote
      .replace(/^[^:]{2,20}:\s*/, "") // prefixo de região ("Europa: ")
      .split(/\s+[—–|-]\s+/)[0]! // "Show Ed Sheeran - Loop Tour" -> "Show Ed Sheeran"
      .split(/\s+com\s+/i)[0]!
      .split(/\s+[-]\s+saindo\s+de\s+/i)[0]!
      .trim();
    t = t.replace(/\s*\b(gr[áa]tis|com a[ée]reo)\b\s*$/i, "").replace(/[,;&]\s*$/, "").trim();
    return t || destino;
  })();

  const titulo = nucleo
    ? origem
      ? `${nucleo} - Saindo de ${origem}`
      : nucleo
    : destino && origem
      ? `${destino} - Saindo de ${origem}`
      : destino;

  const base = (inicio: string | null, fim: string | null): CativaDraft => ({
    cativa_pacote_id: pacote.id,
    cativa_datas_label:
      inicio && fim ? `${inicio.split("-").reverse().join("/")} → ${fim.split("-").reverse().join("/")}` : "Datas a definir",
    slug: slugify(titulo || nomePacote || destino || "pacote"),
    title: titulo,

    kind: "package",
    destination: destino,
    origin: origem,
    going_date: inicio ?? "",
    return_date: fim ?? "",
    nights: noitesEntre(inicio, fim) ?? pacote.noites ?? 0,
    base_occupancy: 2,
    price_per_person: 0,
    taxes: Number(pacote.taxas ?? 0) || 0,
    supplier_name: "Cativa / Viajando com Desconto",
    // Vazio de propósito: o editor gera automaticamente um resumo autoral.
    summary: "",
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

    const { services, todos, resumoTexto, temTransfer, passeios, ingressos } =
      servicosDaOpcao(principal.detalhes);
    d.services = services;
    // "O que inclui" = só o NOME do serviço. Detalhes ficam no diálogo de cada item.
    const bullets = todos.filter((b) => b && !RE_RUIDO_SERVICO.test(b));
    d.includes = ajustarInclusos([...(d.includes as string[]), ...bullets], d.meal_plan as string);



    // O resumo da operadora não vai para o campo público; a IA gera o texto no editor.
    // Roteiro em linha do tempo (Dia 1, Dia 2 …) — sem os textões do operador.
    d.itinerary = gerarRoteiro({
      destino: destino,
      noites: d.nights,
      temTransfer,
      passeios,
      ingressos,
    });


    // O total da opção da Infotravel é do grupo todo (produtos + taxas).
    // Dividimos pela ocupação real do orçamento para obter o valor por pessoa.
    const paxOpcao = paxDaOpcao(principal);
    d.base_occupancy = paxOpcao;
    if (typeof principal.total === "number" && principal.total > 0) {
      d.price_per_person = Math.round((principal.total / paxOpcao) * 100) / 100;
    }

    // Opções de hospedagem: mesmos voos/datas, hotéis diferentes.
    // O mais barato vem selecionado por padrão (índice 0).
    // ocupação padrão do pacote (o preço já é por pessoa)
    const vistos = new Set<string>();
    const hoteis = opcoes
      .slice()
      .sort((a, b) => (a.total ?? Infinity) - (b.total ?? Infinity))
      .map((op) => {
        const ho = hotelDaOpcao(op, pacote);
        if (!ho.hotel_name) return null;
        const estadias = estadiasDaOpcao(op);
        // Roteiros com mais de uma hospedagem: a chave considera TODOS os hotéis da opção.
        const chaveHotel = (estadias.length > 1
          ? estadias.map((s) => `${s.hotel_name}|${s.room_type}`).join(" + ")
          : `${ho.hotel_name}|${ho.room_type}`
        ).toLowerCase();
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
          stays: estadias.length > 1 ? estadias : null,
          price_per_person:
            total != null ? Math.round((total / paxDaOpcao(op)) * 100) / 100 : Number(d.price_per_person) || 0,
          total,
        };
      })
      .filter(Boolean) as Array<Record<string, any>>;

    // Hospedagens sequenciais da opção principal (roteiro com 2+ hotéis)
    const estadiasPrincipal = estadiasDaOpcao(principal);
    d.hotel_stays = estadiasPrincipal.length > 1 ? estadiasPrincipal : null;

    if (hoteis.length > 1) {
      d.hotel_options = hoteis;
      const maisBarato = hoteis[0]!;
      d.hotel_name = maisBarato.hotel_name;
      d.room_type = maisBarato.room_type;
      d.room_category = maisBarato.room_category;
      d.bed_type = maisBarato.bed_type;
      d.meal_plan = maisBarato.meal_plan;
      d.hotel_stays = Array.isArray(maisBarato.stays) && maisBarato.stays.length > 1 ? maisBarato.stays : d.hotel_stays;
      if (maisBarato.price_per_person) d.price_per_person = maisBarato.price_per_person;
      d.includes = ajustarInclusos(d.includes as string[], d.meal_plan as string);

    }

    d.cativa_alternativas = opcoes.length;
    drafts.push(d);
  }


  return drafts.sort((a, b) => String(a.going_date).localeCompare(String(b.going_date)));
}
