/**
 * Endpoint PÚBLICO de teste do motor de busca aéreo (sem usuário/senha).
 *
 *   GET  /api/public/motor-busca            -> documentação (JSON)
 *   POST /api/public/motor-busca            -> executa a busca
 *
 * Body (JSON) — campo "tipo":
 *   "aeroportos"   { query }
 *   "ida"          { origem, destino, data, adultos?, criancas?, bebes? }
 *   "ida-volta"    { origem, destino, data, dataVolta, ... }   -> volta = combinações do voo escolhido
 *   "volta"        { searchKey, flightKey, origem, destino, data, dataVolta, ... }
 *   "multitrecho"  { trechos: [{ origem, destino, data }, ...], adultos?, ... }
 *
 * Somente leitura de disponibilidade da operadora — não expõe dados de cliente.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import type { OnerFlight, OnerLegResult } from "@/lib/onertravel.types";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS },
  });

const iata = z.string().trim().length(3).transform((v) => v.toUpperCase());
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use o formato AAAA-MM-DD");

const paxSchema = {
  adultos: z.number().int().min(1).max(9).default(1),
  criancas: z.number().int().min(0).max(9).default(0),
  bebes: z.number().int().min(0).max(9).default(0),
  limite: z.number().int().min(1).max(50).default(10),
};

const bodySchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("aeroportos"), query: z.string().min(2), partida: z.boolean().default(true) }),
  z.object({
    tipo: z.literal("ida"),
    origem: iata,
    destino: iata,
    data: isoDate,
    ...paxSchema,
  }),
  z.object({
    tipo: z.literal("ida-volta"),
    origem: iata,
    destino: iata,
    data: isoDate,
    dataVolta: isoDate,
    ...paxSchema,
  }),
  z.object({
    tipo: z.literal("volta"),
    searchKey: z.string().min(5),
    flightKey: z.string().min(5),
    origem: iata,
    destino: iata,
    data: isoDate,
    dataVolta: isoDate,
    ...paxSchema,
  }),
  z.object({
    tipo: z.literal("multitrecho"),
    trechos: z
      .array(z.object({ origem: iata, destino: iata, data: isoDate }))
      .min(2)
      .max(6),
    ...paxSchema,
  }),
]);

/* ── Resposta simplificada ─────────────────────────────────────────────── */
const hhmm = (t?: { hour: number; minute: number }) =>
  t ? `${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}` : null;
const ymd = (d?: { year: number; month: number; day: number }) =>
  d ? `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}` : null;

function simplificaVoo(f: OnerFlight) {
  return {
    flightKey: f.key,
    companhia: f.journey?.marketingAirline?.iata ?? null,
    companhiaNome: f.journey?.marketingAirline?.name ?? null,
    paradas: f.journey?.numberOfStops ?? 0,
    duracao: `${f.journey?.flyingTime?.hour ?? 0}h${String(f.journey?.flyingTime?.minute ?? 0).padStart(2, "0")}`,
    classe: f.journey?.fareClass?.cabinClass ?? null,
    familiaTarifaria: f.journey?.fareClass?.airlineFareFamily ?? null,
    bagagemDespachada: !!f.journey?.allowedBaggage,
    partida: {
      iata: f.journey?.departure?.iata ?? null,
      data: ymd(f.journey?.departure?.date),
      hora: hhmm(f.journey?.departure?.time),
    },
    chegada: {
      iata: f.journey?.destination?.iata ?? null,
      data: ymd(f.journey?.destination?.date),
      hora: hhmm(f.journey?.destination?.time),
    },
    conexoes: (f.journey?.segments ?? []).map((s) => ({
      voo: `${s.marketingAirline?.iata ?? ""}${s.flightNumber}`,
      de: s.departure?.iata ?? null,
      para: s.destination?.iata ?? null,
      partida: `${ymd(s.departure?.date)} ${hhmm(s.departure?.time)}`,
      chegada: `${ymd(s.destination?.date)} ${hhmm(s.destination?.time)}`,
    })),
    preco: {
      tarifa: f.price?.price ?? null,
      taxas: f.price?.tax ?? null,
      total: f.price?.total ?? null,
      passageiros: f.price?.passengerCount ?? null,
    },
  };
}

const simplificaLeg = (leg: OnerLegResult | null | undefined, limite: number) => ({
  totalEncontrados: leg?.totalFlightsCount ?? 0,
  faixaDePreco: leg?.priceRange ?? null,
  voos: (leg?.flights ?? []).slice(0, limite).map(simplificaVoo),
});

const DOC = {
  endpoint: "/api/public/motor-busca",
  autenticacao: "nenhuma (endpoint público de teste)",
  metodo: "POST application/json",
  exemplos: {
    aeroportos: { tipo: "aeroportos", query: "guarulhos" },
    ida: { tipo: "ida", origem: "GRU", destino: "REC", data: "2026-10-15", adultos: 1, limite: 5 },
    idaVolta: {
      tipo: "ida-volta",
      origem: "GRU",
      destino: "REC",
      data: "2026-10-15",
      dataVolta: "2026-10-22",
      adultos: 2,
    },
    volta: {
      tipo: "volta",
      searchKey: "<searchKey devolvido na ida-volta>",
      flightKey: "<flightKey do voo de ida escolhido>",
      origem: "GRU",
      destino: "REC",
      data: "2026-10-15",
      dataVolta: "2026-10-22",
    },
    multitrecho: {
      tipo: "multitrecho",
      trechos: [
        { origem: "GRU", destino: "LIS", data: "2026-11-05" },
        { origem: "LIS", destino: "MAD", data: "2026-11-10" },
        { origem: "MAD", destino: "GRU", data: "2026-11-18" },
      ],
      adultos: 1,
      limite: 5,
    },
  },
  observacoes: [
    "Multitrecho executa uma busca só-ida por trecho, na mesma ordem enviada.",
    "Para ida e volta, use 'ida-volta' e depois 'volta' com o searchKey + flightKey escolhido.",
    "Preços em BRL, totais já para o número de passageiros informado.",
  ],
};

export const Route = createFileRoute("/api/public/motor-busca")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async () => json(DOC),
      POST: async ({ request }) => {
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return json({ erro: "JSON inválido no corpo da requisição", ajuda: DOC }, 400);
        }

        const parsed = bodySchema.safeParse(raw);
        if (!parsed.success) {
          return json({ erro: "Parâmetros inválidos", detalhes: parsed.error.issues, ajuda: DOC }, 400);
        }
        const body = parsed.data;

        const {
          searchAirports,
          searchFlights,
          searchInboundFlights,
          flightSearchInput,
          inboundSearchInput,
        } = await import("@/lib/onertravel.server");

        try {
          if (body.tipo === "aeroportos") {
            const aeroportos = await searchAirports({ query: body.query, isDeparture: body.partida });
            return json({ tipo: body.tipo, aeroportos });
          }

          const pax = {
            adults: body.adultos,
            children: body.criancas,
            infants: body.bebes,
            pageSize: 50,
            departureIsCity: false,
            arrivalIsCity: false,
          } as const;

          if (body.tipo === "multitrecho") {
            const trechos: Array<{
              trecho: string;
              data: string;
              searchKey: string;
              totalEncontrados: number;
              faixaDePreco: unknown;
              voos: ReturnType<typeof simplificaVoo>[];
            }> = [];
            for (const t of body.trechos) {
              const r = await searchFlights(
                flightSearchInput.parse({
                  ...pax,
                  departureIata: t.origem,
                  arrivalIata: t.destino,
                  departureDate: t.data,
                }),
              );
              trechos.push({
                trecho: `${t.origem}-${t.destino}`,
                data: t.data,
                searchKey: r.searchKey,
                ...simplificaLeg(r.outbound, body.limite),
              });
            }
            const totalMaisBarato = trechos.reduce(
              (acc, t) => acc + (t.voos[0]?.preco?.total ?? 0),
              0,
            );
            return json({ tipo: body.tipo, trechos, totalMaisBaratoSomado: totalMaisBarato });
          }

          if (body.tipo === "volta") {
            const inbound = await searchInboundFlights(
              inboundSearchInput.parse({
                ...pax,
                departureIata: body.origem,
                arrivalIata: body.destino,
                departureDate: body.data,
                returnDate: body.dataVolta,
                searchKey: body.searchKey,
                flightKey: body.flightKey,
              }),
            );
            return json({
              tipo: body.tipo,
              searchKey: body.searchKey,
              volta: simplificaLeg(inbound, body.limite),
            });
          }

          const result = await searchFlights(
            flightSearchInput.parse({
              ...pax,
              departureIata: body.origem,
              arrivalIata: body.destino,
              departureDate: body.data,
              returnDate: body.tipo === "ida-volta" ? body.dataVolta : null,
            }),
          );

          return json({
            tipo: body.tipo,
            searchKey: result.searchKey,
            ida: simplificaLeg(result.outbound, body.limite),
            ...(body.tipo === "ida-volta"
              ? {
                  comoBuscarVolta: {
                    tipo: "volta",
                    searchKey: result.searchKey,
                    flightKey: "<flightKey de um voo da lista 'ida'>",
                    origem: body.origem,
                    destino: body.destino,
                    data: body.data,
                    dataVolta: body.dataVolta,
                  },
                }
              : {}),
          });
        } catch (e) {
          return json({ erro: e instanceof Error ? e.message : "Falha na consulta da operadora" }, 502);
        }
      },
    },
  },
});
