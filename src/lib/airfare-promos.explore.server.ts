/**
 * PESQUISA MANUAL DE OPORTUNIDADES (Command Center).
 *
 * Nenhum campo é obrigatório além de pelo menos UMA pista (origem OU destino).
 * Com apenas a origem (ex.: MGF), usamos o radar do Melhores Destinos para
 * descobrir para onde tem tarifa boa saindo dali e revalidamos cada candidata
 * no motor VIA AIR — o preço comercial NUNCA vem da fonte de descoberta.
 */
import { scopeOfRoute } from "@/lib/br-airports";
import { discoverCandidates, fallbackDatePairs, type PromoCandidate } from "@/lib/airfare-promos.discovery.server";

export type ExploreInput = {
  origin?: string | null;
  destination?: string | null;
  departureDate?: string | null;
  returnDate?: string | null;
  scope?: "nacional" | "internacional" | null;
  adults?: number;
  limit?: number;
};

type Row = Record<string, unknown>;

const up = (v?: string | null) => (v ? v.trim().toUpperCase() : "");

/** Monta a fila de trechos/datas que serão cotados no motor. */
export async function buildExploreQueue(input: ExploreInput): Promise<PromoCandidate[]> {
  const origin = up(input.origin);
  const destination = up(input.destination);
  const ida = input.departureDate || null;
  const volta = input.returnDate || null;
  const limit = Math.max(1, Math.min(input.limit ?? 6, 12));

  // Trecho totalmente informado: cotação direta, sem passar pelo radar.
  if (origin.length === 3 && destination.length === 3) {
    const datas = ida ? [{ departureDate: ida, returnDate: volta }] : fallbackDatePairs();
    return datas.slice(0, limit).map((d) => ({
      signature: `${origin}|${destination}|${d.departureDate}|${d.returnDate ?? "-"}`,
      scope: input.scope ?? scopeOfRoute(origin, destination),
      origin_iata: origin,
      origin_city: null,
      destination_iata: destination,
      destination_city: null,
      departure_date: d.departureDate,
      return_date: d.returnDate ?? null,
      priority: 0,
      reference_source: "manual",
      reference_price: null,
      reference_origin: null,
      reference_destination: null,
      reference_departure_date: null,
      reference_return_date: null,
      reference_collected_at: new Date().toISOString(),
    }));
  }

  // Só origem (ou só destino): descobre oportunidades reais no radar.
  const { candidates } = await discoverCandidates({ pages: 3, datesPerRoute: 2 });
  const filtradas = candidates.filter((c) => {
    if (origin && c.origin_iata !== origin) return false;
    if (destination && c.destination_iata !== destination) return false;
    if (ida && c.departure_date !== ida) return false;
    if (input.scope && scopeOfRoute(c.origin_iata, c.destination_iata) !== input.scope) return false;
    return true;
  });

  return filtradas
    .sort((a, b) => (a.reference_price ?? Infinity) - (b.reference_price ?? Infinity))
    .slice(0, limit);
}

/** Cota cada candidata no motor VIA AIR e devolve as tarifas encontradas. */
export async function exploreOpportunities(input: ExploreInput): Promise<Array<Record<string, string | number | boolean | null | object>>> {
  const fila = await buildExploreQueue(input);
  if (!fila.length) return [];

  const { loadMarkups, quoteRoute } = await import("@/lib/airfare-promos.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const markups = await loadMarkups(supabaseAdmin as never);

  const rows: Row[] = [];
  for (const c of fila) {
    try {
      const row = await quoteRoute({
        route: {
          id: "manual",
          origin_iata: c.origin_iata,
          origin_city: c.origin_city,
          destination_iata: c.destination_iata,
          destination_city: c.destination_city,
          scope: c.scope,
          priority: 0,
        },
        departureDate: c.departure_date,
        returnDate: c.return_date,
        markups,
        adults: input.adults ?? 1,
      });
      if (!row) continue;
      rows.push({
        ...(row as Row),
        reference_source: c.reference_source,
        reference_price: c.reference_price,
        reference_collected_at: c.reference_collected_at,
      });
    } catch {
      /* trecho sem tarifa disponível: segue para o próximo */
    }
  }

  return JSON.parse(JSON.stringify(rows)) as Array<Record<string, string | number | boolean | null | object>>;
}
