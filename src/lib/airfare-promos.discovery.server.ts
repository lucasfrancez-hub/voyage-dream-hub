/**
 * RADAR DE OPORTUNIDADES — Melhores Destinos.
 *
 * Aqui o Melhores Destinos é usado APENAS para descobrir oportunidades
 * (origem, destino, datas reais e preço de referência). O preço comercial
 * NUNCA vem daqui: cada candidata é obrigatoriamente revalidada no motor
 * VIA AIR antes de virar promoção.
 *
 * Reaproveita o mesmo serviço já usado pela tela "Passagens Baratas"
 * (`melhores-destinos.server.ts`) — não existe segunda implementação.
 */
import {
  MAX_EXTRA_ORIGINS,
  PRIORITY_ORIGINS_HUB,
  PRIORITY_ORIGINS_NACIONAL,
  isPriorityOrigin,
  maxOpportunitiesForOrigin,
  type OriginMetrics,
} from "@/lib/airfare-promos.config";
import { datasDaRotaHandler, listarPromocoesHandler } from "@/lib/melhores-destinos.server";

export type PromoCandidate = {
  signature: string;
  scope: "nacional" | "internacional";
  origin_iata: string;
  origin_city: string | null;
  destination_iata: string;
  destination_city: string | null;
  departure_date: string;
  return_date: string | null;
  priority: number;
  reference_source: string;
  reference_price: number | null;
  reference_origin: string | null;
  reference_destination: string | null;
  reference_departure_date: string | null;
  reference_return_date: string | null;
  reference_collected_at: string;
};

/** Origens que precisam estar sempre representadas na curadoria (config central). */
export { PRIORITY_ORIGINS_NACIONAL, PRIORITY_ORIGINS_HUB } from "@/lib/airfare-promos.config";


/** Sementes usadas só para garantir cobertura das origens prioritárias. */
export const PRIORITY_SEEDS: Array<{
  origin: string;
  originCity: string;
  destination: string;
  destinationCity: string;
  scope: "nacional" | "internacional";
}> = [
  { origin: "MGF", originCity: "Maringá", destination: "GRU", destinationCity: "São Paulo", scope: "nacional" },
  { origin: "LDB", originCity: "Londrina", destination: "GRU", destinationCity: "São Paulo", scope: "nacional" },
  { origin: "CWB", originCity: "Curitiba", destination: "GIG", destinationCity: "Rio de Janeiro", scope: "nacional" },
  { origin: "CAC", originCity: "Cascavel", destination: "GRU", destinationCity: "São Paulo", scope: "nacional" },
  { origin: "IGU", originCity: "Foz do Iguaçu", destination: "GRU", destinationCity: "São Paulo", scope: "nacional" },
  { origin: "GRU", originCity: "São Paulo", destination: "LIS", destinationCity: "Lisboa", scope: "internacional" },
  { origin: "GIG", originCity: "Rio de Janeiro", destination: "MCO", destinationCity: "Orlando", scope: "internacional" },
  { origin: "BSB", originCity: "Brasília", destination: "EZE", destinationCity: "Buenos Aires", scope: "internacional" },
  { origin: "CWB", originCity: "Curitiba", destination: "SCL", destinationCity: "Santiago", scope: "internacional" },
];

const BR_IATA = new Set([
  "GRU","CGH","VCP","GIG","SDU","BSB","CNF","PLU","CWB","POA","FLN","SSA","REC","FOR","NAT","MCZ",
  "AJU","THE","SLZ","BEL","MAO","MGF","LDB","CGB","CGR","GYN","VIX","IGU","NVT","JPA","PMW","MCP",
  "PVH","RBR","BVB","STM","CAC","JOI","XAP","UDI","RAO","SJP","PPB","MII","IOS","JJD","PNZ","IMP",
]);

export function scopeOf(origin: string, destination: string): "nacional" | "internacional" {
  return BR_IATA.has(origin.toUpperCase()) && BR_IATA.has(destination.toUpperCase())
    ? "nacional"
    : "internacional";
}

/** Assinatura da OPORTUNIDADE (sem companhia) — usada para deduplicar a fila. */
export function candidateSignature(p: {
  origin_iata: string;
  destination_iata: string;
  departure_date: string;
  return_date: string | null;
}): string {
  return [p.origin_iata, p.destination_iata, p.departure_date, p.return_date ?? "-"].join("|").toUpperCase();
}

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Datas de fallback (só para sementes/rotas monitoradas). */
export function fallbackDatePairs(offsets = [45, 75]) {
  const base = new Date();
  return offsets.map((off) => {
    const out = new Date(base);
    out.setDate(out.getDate() + off);
    const back = new Date(out);
    back.setDate(back.getDate() + 7);
    return { departureDate: iso(out), returnDate: iso(back) };
  });
}

function isFuture(dateIso: string) {
  return dateIso >= iso(new Date());
}

/**
 * Descobre oportunidades no Melhores Destinos e devolve candidatas
 * normalizadas e deduplicadas (uma validação por oportunidade).
 */
export async function discoverCandidates(opts?: {
  pages?: number;
  datesPerRoute?: number;
  maxCandidates?: number;
}): Promise<PromoCandidate[]> {
  const datesPerRoute = opts?.datesPerRoute ?? 2;
  const maxCandidates = opts?.maxCandidates ?? 120;
  const collectedAt = new Date().toISOString();
  const mapa = new Map<string, PromoCandidate>();

  const add = (c: PromoCandidate) => {
    const atual = mapa.get(c.signature);
    // mesma oportunidade repetida na fonte: mantém a referência mais barata/recente
    if (!atual || (c.reference_price ?? Infinity) < (atual.reference_price ?? Infinity)) {
      mapa.set(c.signature, { ...c, priority: Math.min(c.priority, atual?.priority ?? c.priority) });
    }
  };

  let promos: Awaited<ReturnType<typeof listarPromocoesHandler>>["promos"] = [];
  try {
    const res = await listarPromocoesHandler({ data: { pages: opts?.pages ?? 3 } });
    promos = res.promos;
  } catch {
    promos = [];
  }

  for (const promo of promos) {
    if (!promo.key) continue;
    for (const rota of promo.routes) {
      if (mapa.size >= maxCandidates) break;
      const origin = rota.originCode.toUpperCase();
      const destination = rota.destinationCode.toUpperCase();
      if (origin.length !== 3 || destination.length !== 3 || origin === destination) continue;

      let datas: Awaited<ReturnType<typeof datasDaRotaHandler>>["dates"] = [];
      try {
        const det = await datasDaRotaHandler({
          data: { key: promo.key, from: origin, to: destination },
        });
        datas = det.dates.filter((d) => isFuture(d.departDate)).slice(0, datesPerRoute);
      } catch {
        datas = [];
      }

      const scope = scopeOf(origin, destination);
      const prioridade =
        (PRIORITY_ORIGINS_NACIONAL as readonly string[]).includes(origin) ||
        (PRIORITY_ORIGINS_HUB as readonly string[]).includes(origin)
          ? 10
          : 100;

      if (datas.length === 0) {
        // sem datas próprias na fonte: cai no fallback +45/+75 (1 data)
        const [p1] = fallbackDatePairs([45]);
        if (!p1) continue;
        add({
          signature: candidateSignature({
            origin_iata: origin,
            destination_iata: destination,
            departure_date: p1.departureDate,
            return_date: p1.returnDate,
          }),
          scope,
          origin_iata: origin,
          origin_city: rota.originName ?? null,
          destination_iata: destination,
          destination_city: rota.destinationName ?? null,
          departure_date: p1.departureDate,
          return_date: p1.returnDate,
          priority: prioridade,
          reference_source: "melhores_destinos",
          reference_price: rota.price || null,
          reference_origin: origin,
          reference_destination: destination,
          reference_departure_date: null,
          reference_return_date: null,
          reference_collected_at: collectedAt,
        });
        continue;
      }

      for (const d of datas) {
        add({
          signature: candidateSignature({
            origin_iata: origin,
            destination_iata: destination,
            departure_date: d.departDate,
            return_date: d.returnDate,
          }),
          scope,
          origin_iata: origin,
          origin_city: rota.originName ?? null,
          destination_iata: destination,
          destination_city: rota.destinationName ?? null,
          departure_date: d.departDate,
          return_date: d.returnDate,
          priority: prioridade,
          reference_source: "melhores_destinos",
          reference_price: d.price || rota.price || null,
          reference_origin: origin,
          reference_destination: destination,
          reference_departure_date: d.departDate,
          reference_return_date: d.returnDate,
          reference_collected_at: collectedAt,
        });
      }
    }
  }

  // garante cobertura das origens prioritárias (MGF, LDB, CWB, CAC, IGU, GRU, GIG, BSB)
  const origensCobertas = new Set([...mapa.values()].map((c) => c.origin_iata));
  for (const seed of PRIORITY_SEEDS) {
    if (origensCobertas.has(seed.origin) && mapa.size >= 8) continue;
    for (const par of fallbackDatePairs([45, 75])) {
      add({
        signature: candidateSignature({
          origin_iata: seed.origin,
          destination_iata: seed.destination,
          departure_date: par.departureDate,
          return_date: par.returnDate,
        }),
        scope: seed.scope,
        origin_iata: seed.origin,
        origin_city: seed.originCity,
        destination_iata: seed.destination,
        destination_city: seed.destinationCity,
        departure_date: par.departureDate,
        return_date: par.returnDate,
        priority: 20,
        reference_source: "origem_prioritaria",
        reference_price: null,
        reference_origin: seed.origin,
        reference_destination: seed.destination,
        reference_departure_date: null,
        reference_return_date: null,
        reference_collected_at: collectedAt,
      });
    }
  }

  return [...mapa.values()].sort((a, b) => a.priority - b.priority).slice(0, maxCandidates);
}
