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
};

export type FlightQuoteResult = {
  origem_iata: string;
  destino_iata: string;
  origem_nome: string;
  destino_nome: string;
  data_ida: string;
  data_volta: string | null;
  passageiros: { adultos: number; criancas: number; bebes: number };
  opcoes: FlightQuoteOption[];
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

/** Resolve texto livre ("Curitiba", "cwb", "São Paulo") no IATA da operadora. */
async function resolveIata(
  query: string,
  isDeparture: boolean,
): Promise<{ iata: string; nome: string } | null> {
  const raw = query.trim();
  if (!raw) return null;
  const list = await searchAirports({ query: raw, isDeparture });
  if (!list.length) return null;
  const up = raw.toUpperCase();
  const exato = list.find((a) => a.iata.toUpperCase() === up && up.length === 3);
  const cidade = list.find((a) => a.isCity) ?? list[0];
  const pick = exato ?? cidade;
  return { iata: pick.iata.toUpperCase(), nome: pick.city || pick.name || pick.iata };
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
};

export async function quoteFlights(params: QuoteFlightsParams): Promise<FlightQuoteResult | { error: string }> {
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

  const baseFilters = {
    containsDispatchBaggage: bagagem,
    maxStops: 2,
    startPrice: null,
    endPrice: null,
    airlineIatas: [] as string[],
    cabinClass: null,
  };

  const base = {
    departureIata: org.iata,
    arrivalIata: dst.iata,
    departureDate: params.data_ida,
    adults: adultos,
    children: criancas,
    infants: bebes,
    pageSize: 50,
    departureIsCity: false,
    arrivalIsCity: false,
  };

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


  const idas = [...(search.outbound?.flights ?? [])];
  if (!idas.length) return { error: "A operadora não retornou voos para essa data/rota" };

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
        const lista = inbound.flights ?? [];
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

  for (let i = 0; i < escolhidos.length; i++) {
    const ida = escolhidos[i];
    const volta = voltas[i];
    if (params.data_volta && !volta) continue;

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
      ida: toLeg(ida),
      volta: volta ? toLeg(volta) : null,
    });
  }


  if (!opcoes.length) return { error: "Não consegui montar combinações de ida e volta para essas datas" };

  opcoes.sort((a, b) => a.total - b.total);
  opcoes.forEach((o, i) => (o.opcao = i + 1));

  return {
    origem_iata: org.iata,
    destino_iata: dst.iata,
    origem_nome: org.nome,
    destino_nome: dst.nome,
    data_ida: params.data_ida,
    data_volta: params.data_volta ?? null,
    passageiros: { adultos, criancas, bebes },
    opcoes,
    observacao:
      "Valores da operadora em tempo real, sujeitos a alteração e disponibilidade até a emissão. Total já inclui taxas para todos os passageiros.",
  };
}
