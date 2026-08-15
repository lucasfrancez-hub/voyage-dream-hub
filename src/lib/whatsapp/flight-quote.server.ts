/**
 * Cotação de aéreo para os agentes de IA (WhatsApp).
 * Resolve cidade -> IATA, busca ida (e volta) na operadora e devolve as
 * melhores opções já rankeadas por custo-benefício, prontas pra IA escrever.
 * SERVER-ONLY.
 */
import {
  searchAirports,
  searchFlights,
  searchInboundFlights,
} from "@/lib/onertravel.server";
import type { OnerFlight, OnerPlace } from "@/lib/onertravel.types";
import { flightHasBaggage } from "@/lib/onertravel.types";
import { combinacaoIdaVoltaValida } from "./flight-search-validation";
import { airlineListToIatas, airlineMatches } from "./airline-codes";
import {
  atendePedido,
  interpretarLocal,
  isCodigoDeCidade,
  type LocalInterpretado,
} from "./airport-city";

export type PeriodoDia = "manha" | "tarde" | "noite" | "livre";

export type FlightQuoteLeg = {
  cia: string;
  voo: string;
  origem: string;
  destino: string;
  partida: string; // "2026-08-10 07:35"
  chegada: string;
  duracao: string; // "3h20"
  paradas: number;
  escalas: string[]; // ["GRU (1h10)"]
  bagagem_despachada: boolean;
};

/** Chaves da operadora necessárias pra gerar o carrinho do Comprar Viagem. */
export type FlightQuoteCart = {
  outboundFareId: string;
  outboundItineraryId: string;
  inboundFareId: string | null;
  inboundItineraryId: string | null;
};

export type FlightQuoteOption = {
  opcao: number;
  destaque: string; // "mais barata" | "voo direto" | "melhor custo-benefício" | "mais rápida"
  total: number;
  total_formatado: string;
  por_pessoa: number;
  por_pessoa_formatado: string;
  passageiros: number;
  bagagem_despachada: boolean;
  ida: FlightQuoteLeg;
  volta: FlightQuoteLeg | null;
  cart: FlightQuoteCart;
};

/** Filtros que o cliente pediu e que foram efetivamente aplicados na busca. */
export type FlightQuoteFilters = {
  somente_voo_direto: boolean;
  maximo_conexoes: number;
  companhias_incluidas: string[]; // IATA
  companhias_excluidas: string[]; // IATA
  bagagem_despachada: boolean;
  periodo_ida: PeriodoDia;
  periodo_volta: PeriodoDia | null;
};

export type FlightQuoteResult = {
  origem_iata: string;
  destino_iata: string;
  origem_nome: string;
  destino_nome: string;
  data_ida: string;
  data_volta: string | null;
  search_key: string | null;
  passageiros: { adultos: number; criancas: number; bebes: number };
  opcoes: FlightQuoteOption[];
  filtros: FlightQuoteFilters;
  observacao: string;
};


const PERIODOS: Record<Exclude<PeriodoDia, "livre">, [number, number]> = {
  manha: [300, 720], // 05:00 - 12:00
  tarde: [720, 1080], // 12:00 - 18:00
  noite: [1080, 1439], // 18:00 - 23:59
};

function janela(p?: PeriodoDia | null): { from: number | null; to: number | null } {
  if (!p || p === "livre") return { from: null, to: null };
  const w = PERIODOS[p];
  return w ? { from: w[0], to: w[1] } : { from: null, to: null };
}

function money(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function stamp(p: OnerPlace): string {
  return `${p.date.year}-${pad(p.date.month)}-${pad(p.date.day)} ${pad(p.time.hour)}:${pad(p.time.minute)}`;
}

function minutesOf(p: OnerPlace): number {
  return Date.UTC(p.date.year, p.date.month - 1, p.date.day, p.time.hour, p.time.minute) / 60000;
}

function toLeg(f: OnerFlight): FlightQuoteLeg {
  const j = f.journey;
  const segs = j.segments ?? [];
  const escalas: string[] = [];
  for (let i = 0; i < segs.length - 1; i++) {
    const espera = minutesOf(segs[i + 1].departure) - minutesOf(segs[i].destination);
    const h = Math.floor(Math.max(0, espera) / 60);
    const m = Math.max(0, espera) % 60;
    escalas.push(`${segs[i].destination.iata} (${h}h${pad(m)})`);
  }
  const cia = j.marketingAirline?.name || segs[0]?.marketingAirline?.name || j.marketingAirline?.iata || "—";
  return {
    cia,
    voo: segs.map((s) => s.flightNumber).filter(Boolean).join(" + ") || "—",
    origem: j.departure.iata,
    destino: j.destination.iata,
    partida: stamp(j.departure),
    chegada: stamp(j.destination),
    duracao: `${j.flyingTime.hour}h${pad(j.flyingTime.minute)}`,
    paradas: j.numberOfStops ?? Math.max(0, segs.length - 1),
    escalas,
    bagagem_despachada: flightHasBaggage(f),
  };
}

function duracaoMin(f: OnerFlight): number {
  return f.journey.flyingTime.hour * 60 + f.journey.flyingTime.minute;
}

/** Nota de custo-benefício: preço + penalidade por escala e por duração. */
function score(total: number, minutos: number, paradas: number): number {
  return total + paradas * 180 + minutos * 1.2;
}

/** Nomes por extenso (e ACENTUADOS) das cidades que aparecem pro cliente. */
const NOMES_CIDADE: Record<string, string> = {
  SAO: "São Paulo",
  RIO: "Rio de Janeiro",
  BHZ: "Belo Horizonte",
  GRU: "São Paulo",
  CGH: "São Paulo",
  VCP: "Campinas",
  GIG: "Rio de Janeiro",
  SDU: "Rio de Janeiro",
  BSB: "Brasília",
  CWB: "Curitiba",
  MAO: "Manaus",
  BUE: "Buenos Aires",
  NYC: "Nova York",
  MIA: "Miami",
  MCO: "Orlando",
  LIS: "Lisboa",
  MGF: "Maringá",
  LDB: "Londrina",
  IGU: "Foz do Iguaçu",
  CAC: "Cascavel",
  FLN: "Florianópolis",
  POA: "Porto Alegre",
  GYN: "Goiânia",
  CGB: "Cuiabá",
  CGR: "Campo Grande",
  BEL: "Belém",
  SSA: "Salvador",
  REC: "Recife",
  FOR: "Fortaleza",
  NAT: "Natal",
  JPA: "João Pessoa",
  MCZ: "Maceió",
  AJU: "Aracaju",
  THE: "Teresina",
  SLZ: "São Luís",
  VIX: "Vitória",
  UDI: "Uberlândia",
  RAO: "Ribeirão Preto",
  PMW: "Palmas",
  PVH: "Porto Velho",
  RBR: "Rio Branco",
  BVB: "Boa Vista",
  MCP: "Macapá",
  JOI: "Joinville",
  NVT: "Navegantes",
  XAP: "Chapecó",
  PET: "Pelotas",
  BPS: "Porto Seguro",
  IOS: "Ilhéus",
  JDO: "Juazeiro do Norte",
  MVD: "Montevidéu",
  SCL: "Santiago",
  EZE: "Buenos Aires",
  AEP: "Buenos Aires",
  ASU: "Assunção",
  LIM: "Lima",
  BOG: "Bogotá",
  MEX: "Cidade do México",
  CUN: "Cancún",
  PTY: "Cidade do Panamá",
  MAD: "Madri",
  BCN: "Barcelona",
  CDG: "Paris",
  PAR: "Paris",
  FCO: "Roma",
  ROM: "Roma",
  LON: "Londres",
  ZRH: "Zurique",
  GVA: "Genebra",
  OPO: "Porto",
};

/**
 * O nome que vai pro cliente NUNCA sai sem acento. A operadora às vezes
 * devolve "Maringa"/"SAO"/"Sao Paulo" e o cliente digita sem acento — a
 * tabela curada acima manda sempre que conhece o código.
 */
function nomeBonito(iata: string, bruto?: string | null): string {
  const curado = NOMES_CIDADE[iata.toUpperCase()];
  if (curado) return curado;
  const nome = (bruto ?? "").trim();
  if (!nome || /^[A-Z]{3}$/.test(nome.toUpperCase())) return iata.toUpperCase();
  return nome;
}



/**
 * Resolve texto livre ("Curitiba", "cwb", "Congonhas", "São Paulo") no que deve
 * ser efetivamente pesquisado.
 *
 * Aeroporto específico ("Congonhas"/"CGH") trava a pesquisa naquele IATA.
 * Cidade ("São Paulo") pesquisa a cidade inteira (GRU + CGH + VCP).
 */
async function resolveIata(
  query: string,
  isDeparture: boolean,
): Promise<{ iata: string; nome: string; isCity: boolean; interpretacao: LocalInterpretado | null } | null> {
  const raw = query.trim();
  if (!raw) return null;

  const local = interpretarLocal(raw);
  if (local?.tipo === "aeroporto" && local.aeroporto_iata) {
    return {
      iata: local.aeroporto_iata,
      nome: local.aeroporto_nome ?? local.aeroporto_iata,
      isCity: false,
      interpretacao: local,
    };
  }

  const list = await searchAirports({ query: raw, isDeparture });
  if (!list.length) {
    if (local?.tipo === "cidade") {
      return {
        iata: local.codigo_pesquisa,
        nome: nomeBonito(local.codigo_pesquisa, local.cidade),
        isCity: true,
        interpretacao: local,
      };
    }
    return null;
  }
  const up = raw.toUpperCase();
  const exato = list.find((a) => a.iata.toUpperCase() === up && up.length === 3);
  const cidade = list.find((a) => a.isCity) ?? list[0];
  const pick = exato ?? cidade;
  const iata = pick.iata.toUpperCase();
  const nome = nomeBonito(iata, pick.city || pick.name);
  const isCity = !!pick.isCity || isCodigoDeCidade(iata);
  return { iata, nome, isCity, interpretacao: local };
}

export type QuoteFlightsParams = {
  origem: string;
  destino: string;
  data_ida: string;
  data_volta?: string | null;
  adultos?: number | null;
  criancas?: number | null;
  bebes?: number | null;
  periodo_ida?: PeriodoDia | null;
  periodo_volta?: PeriodoDia | null;
  bagagem_despachada?: boolean | null;
  max_opcoes?: number | null;
  /** Cliente pediu SÓ voo direto (equivale a maximo_conexoes = 0). */
  somente_voo_direto?: boolean | null;
  /** Teto de conexões por trecho (0, 1 ou 2). */
  maximo_conexoes?: number | null;
  /** Só estas companhias (nome falado ou IATA): "Azul", "LATAM", "AD"… */
  companhias_incluidas?: string[] | null;
  /** Nunca estas companhias ("não quero Gol"). */
  companhias_excluidas?: string[] | null;
};

export type FlightQuoteError = {
  error: string;
  sem_combinacao?: boolean;
  /** Havia voos, mas nenhum atende os filtros pedidos pelo cliente. */
  sem_resultado_por_filtro?: boolean;
  filtros?: FlightQuoteFilters;
};

export async function quoteFlights(params: QuoteFlightsParams): Promise<FlightQuoteResult | FlightQuoteError> {
  const adultos = Math.max(1, params.adultos ?? 1);
  const criancas = Math.max(0, params.criancas ?? 0);
  const bebes = Math.max(0, params.bebes ?? 0);
  const maxOpcoes = Math.min(4, Math.max(3, params.max_opcoes ?? 4));

  const [org, dst] = await Promise.all([
    resolveIata(params.origem, true),
    resolveIata(params.destino, false),
  ]);
  if (!org) return { error: `Não encontrei aeroporto para a origem "${params.origem}"` };
  if (!dst) return { error: `Não encontrei aeroporto para o destino "${params.destino}"` };

  const jIda = janela(params.periodo_ida);
  const jVolta = janela(params.periodo_volta);
  const bagagem = !!params.bagagem_despachada;

  // ── FILTROS PEDIDOS PELO CLIENTE ──────────────────────────────────────────
  // O motor aceita maxStops e marketingAirlineIatas; o que ele não garante
  // (exclusão de companhia e teto exato de conexões) é reforçado aqui.
  const incluidas = airlineListToIatas(params.companhias_incluidas);
  const excluidas = airlineListToIatas(params.companhias_excluidas).filter(
    (i) => !incluidas.includes(i),
  );
  const direto = !!params.somente_voo_direto;
  const maxConexoes = direto
    ? 0
    : Math.min(2, Math.max(0, params.maximo_conexoes ?? 2));

  const filtros: FlightQuoteFilters = {
    somente_voo_direto: direto,
    maximo_conexoes: maxConexoes,
    companhias_incluidas: incluidas,
    companhias_excluidas: excluidas,
    bagagem_despachada: bagagem,
    periodo_ida: params.periodo_ida ?? "livre",
    periodo_volta: params.data_volta ? (params.periodo_volta ?? "livre") : null,
  };

  const baseFilters = {
    containsDispatchBaggage: bagagem,
    maxStops: maxConexoes,
    startPrice: null,
    endPrice: null,
    airlineIatas: incluidas,
    cabinClass: null,
  };

  /** Reforço no cliente: o motor nem sempre respeita teto/exclusão à risca. */
  const atendeFiltros = (f: OnerFlight): boolean => {
    const paradas = f.journey.numberOfStops ?? Math.max(0, (f.journey.segments?.length ?? 1) - 1);
    if (paradas > maxConexoes) return false;
    const cias = [
      f.journey.marketingAirline?.name,
      f.journey.marketingAirline?.iata,
      ...(f.journey.segments ?? []).map((s) => s.marketingAirline?.name),
    ].filter((v): v is string => !!v);
    if (excluidas.length && cias.some((c) => excluidas.some((e) => airlineMatches(c, e)))) return false;
    if (incluidas.length && !cias.some((c) => incluidas.some((e) => airlineMatches(c, e)))) return false;
    // Aeroporto travado pelo cliente ("quero Congonhas"): descarta o que não é dele.
    const chegada = f.journey.destination?.iata;
    if (dst?.interpretacao?.tipo === "aeroporto" && chegada && !atendePedido(dst.interpretacao, chegada)) {
      return false;
    }
    const partida = f.journey.departure?.iata;
    if (org?.interpretacao?.tipo === "aeroporto" && partida && !atendePedido(org.interpretacao, partida)) {
      return false;
    }
    return true;
  };

  const base = {
    departureIata: org.iata,
    arrivalIata: dst.iata,
    departureDate: params.data_ida,
    adults: adultos,
    children: criancas,
    infants: bebes,
    pageSize: 50,
    departureIsCity: org.isCity,
    arrivalIsCity: dst.isCity,
  };

  // LOG de interpretação: cliente disse × interpretado × pesquisado.
  console.log(
    JSON.stringify({
      event: "flight_search_locais",
      origem_cliente: params.origem,
      origem_interpretado: org.interpretacao?.tipo ?? "motor",
      origem_pesquisada: org.iata,
      origem_is_cidade: org.isCity,
      destino_cliente: params.destino,
      destino_interpretado: dst.interpretacao?.tipo ?? "motor",
      destino_pesquisado: dst.iata,
      destino_is_cidade: dst.isCity,
      destino_aeroportos: dst.interpretacao?.aeroportos ?? [],
      at: new Date().toISOString(),
    }),
  );

  let search;
  try {
    // modo "fast": WhatsApp precisa de resposta em segundos, não em meio minuto
    search = await searchFlights(
      {
        ...base,
        returnDate: params.data_volta ?? null,
        searchKey: null,
        filters: { ...baseFilters, departureFrom: jIda.from, departureTo: jIda.to },
      },
      "fast",
    );
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Falha na busca de voos" };
  }


  const brutas = [...(search.outbound?.flights ?? [])];
  if (!brutas.length) return { error: "A operadora não retornou voos para essa data/rota", filtros };
  const idas = brutas.filter(atendeFiltros);
  if (!idas.length) {
    return {
      error: "Existem voos nessa data, mas nenhum atende os filtros pedidos pelo cliente",
      sem_resultado_por_filtro: true,
      filtros,
    };
  }


  // Melhores candidatos de ida por custo-benefício (mais alguns baratos e diretos)
  const porScore = [...idas].sort(
    (a, b) => score(a.price.total, duracaoMin(a), a.journey.numberOfStops) - score(b.price.total, duracaoMin(b), b.journey.numberOfStops),
  );
  const maisBarata = [...idas].sort((a, b) => a.price.total - b.price.total)[0];
  const direta = [...idas]
    .filter((f) => (f.journey.numberOfStops ?? 0) === 0)
    .sort((a, b) => a.price.total - b.price.total)[0];
  const maisRapida = [...idas].sort((a, b) => duracaoMin(a) - duracaoMin(b))[0];

  const candidatos: OnerFlight[] = [];
  const push = (f?: OnerFlight) => {
    if (f && !candidatos.some((c) => c.key === f.key)) candidatos.push(f);
  };
  push(maisBarata);
  push(direta);
  push(porScore[0]);
  push(maisRapida);
  for (const f of porScore) {
    if (candidatos.length >= maxOpcoes) break;
    push(f);
  }
  const escolhidos = candidatos.slice(0, maxOpcoes);

  const opcoes: FlightQuoteOption[] = [];
  const pax = adultos + criancas;

  // Buscas de volta em PARALELO (antes eram sequenciais: 4 idas = 4 esperas)
  const voltas = await Promise.all(
    escolhidos.map(async (ida): Promise<OnerFlight | null> => {
      if (!params.data_volta) return null;
      try {
        const inbound = await searchInboundFlights(
          {
            ...base,
            returnDate: params.data_volta,
            searchKey: search.searchKey,
            flightKey: ida.key,
            filters: { ...baseFilters, departureFrom: jVolta.from, departureTo: jVolta.to },
          },
          "fast",
        );
        // A volta obedece aos MESMOS filtros pedidos pelo cliente.
        const lista = (inbound.flights ?? []).filter(atendeFiltros);
        if (!lista.length) return null;
        return [...lista].sort(
          (a, b) =>
            score(a.price.total, duracaoMin(a), a.journey.numberOfStops) -
            score(b.price.total, duracaoMin(b), b.journey.numberOfStops),
        )[0];
      } catch {
        return null;
      }
    }),
  );

  let descartadasPorCombinacao = 0;
  for (let i = 0; i < escolhidos.length; i++) {
    const ida = escolhidos[i];
    const volta = voltas[i];
    if (params.data_volta && !volta) continue;

    const legIda = toLeg(ida);
    const legVolta = volta ? toLeg(volta) : null;

    // COMBINAÇÃO REAL: a volta precisa decolar DEPOIS da chegada final da ida
    // (considerando conexões, virada de dia, mudança de aeroporto e o horário
    // local devolvido pelo motor). Vale principalmente para o bate-volta.
    if (legVolta && !combinacaoIdaVoltaValida(legIda, legVolta)) {
      descartadasPorCombinacao++;
      continue;
    }

    // Na operadora, o preço da volta já é o total do par ida+volta.
    const total = volta ? volta.price.total : ida.price.total;
    const totalPax = Math.max(1, volta?.price.passengerCount ?? ida.price.passengerCount ?? pax);
    const destaque =
      ida.key === direta?.key && (ida.journey.numberOfStops ?? 0) === 0
        ? "voo direto"
        : ida.key === maisBarata?.key
          ? "mais em conta"
          : ida.key === maisRapida?.key
            ? "mais rápida"
            : "melhor custo-benefício";

    opcoes.push({
      opcao: opcoes.length + 1,
      destaque,
      total,
      total_formatado: money(total),
      por_pessoa: Math.round((total / totalPax) * 100) / 100,
      por_pessoa_formatado: money(total / totalPax),
      passageiros: totalPax,
      bagagem_despachada: flightHasBaggage(volta ?? ida),
      ida: legIda,
      volta: legVolta,
      cart: {
        outboundFareId: ida.key,
        outboundItineraryId: ida.journey.key ?? "",
        inboundFareId: volta?.key ?? null,
        inboundItineraryId: volta?.journey?.key ?? null,
      },
    });
  }


  if (!opcoes.length) {
    return {
      error: descartadasPorCombinacao
        ? "Existem voos, mas nenhuma combinação de ida e volta é possível nesses horários"
        : "Não consegui montar combinações de ida e volta para essas datas",
      sem_combinacao: descartadasPorCombinacao > 0,
      filtros,
    };
  }


  opcoes.sort((a, b) => a.total - b.total);
  opcoes.forEach((o, i) => (o.opcao = i + 1));

  // LOG de validação cruzada: o que o motor devolveu de fato.
  console.log(
    JSON.stringify({
      event: "flight_search_resultado",
      destino_cliente: params.destino,
      destino_pesquisado: dst.iata,
      aeroportos_retornados: [...new Set(opcoes.map((o) => o.ida.destino))],
      origens_retornadas: [...new Set(opcoes.map((o) => o.ida.origem))],
      total_opcoes: opcoes.length,
      at: new Date().toISOString(),
    }),
  );


  return {
    origem_iata: org.iata,
    destino_iata: dst.iata,
    origem_nome: org.nome,
    destino_nome: dst.nome,
    data_ida: params.data_ida,
    data_volta: params.data_volta ?? null,
    search_key: search.searchKey ?? null,
    passageiros: { adultos, criancas, bebes },
    opcoes,
    filtros,
    observacao:
      "Valores da operadora em tempo real, sujeitos a alteração e disponibilidade até a emissão. Total já inclui taxas para todos os passageiros.",
  };
}
