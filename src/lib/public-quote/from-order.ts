/**
 * Converte o orçamento legado de um PEDIDO (token assinado, /orcamento/<nº>-<hash>)
 * no DTO do orçamento público oficial VIA AIR — o modelo aprovado.
 *
 * Detecção automática do tipo:
 *   • apenas voos            -> AIR_ONLY      (cartão + Pix, nunca boleto)
 *   • hotel/serviços/pacote  -> TRIP_PACKAGE  (cartão + boleto + Pix)
 *
 * Nada de comissão, custo ou dado interno entra aqui.
 */
import { cityLabel } from "@/lib/iata-lookup";
import { cardInstallments, boletoInstallments, PIX_DISCOUNT_PERCENT } from "./payments";
import type {
  FlightLeg,
  FlightSegment,
  HotelProduct,
  Installment,
  PaymentConfiguration,
  PublicQuote as PremiumQuote,
  QuoteProducts,
  QuoteSummaryLine,
  QuoteType,
  SimpleProduct,
} from "./types";
import type { PublicQuote as LegacyQuote, PublicQuoteItem, QuoteConfig } from "@/lib/quote.functions";

const DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function timeOf(stamp?: string | null): string {
  if (!stamp) return "—";
  const m = String(stamp).match(/(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : "—";
}

function dateLabel(stamp?: string | null): string {
  const m = String(stamp ?? "").match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "—";
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return `${DIAS[d.getUTCDay()]}, ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`;
}

function brDate(stamp?: string | null): string | null {
  const m = String(stamp ?? "").match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return stamp ? String(stamp) : null;
  return `${m[3]}/${m[2]}`;
}

function isoDate(stamp?: string | null): string | null {
  const m = String(stamp ?? "").match(/\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : null;
}

function durationBetween(from?: string | null, to?: string | null): string | null {
  if (!from || !to) return null;
  const a = Date.parse(from);
  const b = Date.parse(to);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
  const mins = Math.round((b - a) / 60000);
  return `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, "0")}`;
}

/** "2026-09-10T06:10" -> "2026-09-10 06:10" (formato esperado pelos cards). */
function stamp(v?: string | null): string {
  if (!v) return "";
  const s = String(v).replace("T", " ");
  const m = s.match(/(\d{4}-\d{2}-\d{2})[ ]?(\d{2}:\d{2})?/);
  if (!m) return s;
  return m[2] ? `${m[1]} ${m[2]}` : m[1];
}

function segmentOf(item: PublicQuoteItem): FlightSegment {
  const fromIata = item.from_iata ?? "";
  const toIata = item.to_iata ?? "";
  return {
    airline: item.airline ?? "Companhia aérea",
    flightNumber: item.flight_number ?? null,
    fromIata,
    fromName: item.from_city ?? cityLabel(fromIata) ?? null,
    toIata,
    toName: item.to_city ?? cityLabel(toIata) ?? null,
    departure: stamp(item.departure_at),
    arrival: stamp(item.arrival_at),
    duration: durationBetween(item.departure_at, item.arrival_at),
  };
}

/**
 * Monta UM trecho (ida ou volta) a partir de todos os voos daquela direção.
 * Origem = primeiro embarque, destino = destino final; conexões aparecem
 * apenas dentro de "Ver detalhes do voo".
 */
function buildLeg(items: PublicQuoteItem[], direction: "OUTBOUND" | "INBOUND"): FlightLeg {
  const first = items[0]!;
  const last = items[items.length - 1]!;
  const segments = items.map(segmentOf);
  for (let i = 0; i < segments.length - 1; i++) {
    const espera = durationBetween(items[i]!.arrival_at, items[i + 1]!.departure_at);
    if (espera) segments[i]!.connectionAfter = `Conexão em ${segments[i]!.toName ?? segments[i]!.toIata} • ${espera}`;
  }
  const stops = Math.max(0, items.length - 1);
  return {
    direction,
    label: direction === "OUTBOUND" ? "Voo de ida" : "Voo de volta",
    airline: first.airline ?? "Companhia aérea",
    dateLabel: dateLabel(first.departure_at),
    departureTime: timeOf(first.departure_at),
    arrivalTime: timeOf(last.arrival_at),
    fromIata: first.from_iata ?? "",
    fromCity: first.from_city ?? cityLabel(first.from_iata ?? "") ?? null,
    toIata: last.to_iata ?? "",
    toCity: last.to_city ?? cityLabel(last.to_iata ?? "") ?? null,
    duration: durationBetween(first.departure_at, last.arrival_at),
    stops,
    stopsLabel: stops === 0 ? "Direto" : `${stops} ${stops === 1 ? "conexão" : "conexões"}`,
    cabin: first.cabin_class ?? null,
    carryOn: items.every((i) => i.carry_on !== false),
    personalItem: items.every((i) => i.personal_item !== false),
    checkedBaggage: items.every((i) => i.checked_bag === true),
    segments,
  };
}

/** Agrupa os voos em trechos (ida / volta) respeitando trip_group. */
function buildLegs(voos: PublicQuoteItem[]): FlightLeg[] {
  const groups = new Map<string, PublicQuoteItem[]>();
  const ordem: string[] = [];
  voos.forEach((v, i) => {
    const dir = v.direction === "return" ? "INBOUND" : "OUTBOUND";
    const key = `${v.trip_group ?? "default"}|${dir}`;
    if (!groups.has(key)) { groups.set(key, []); ordem.push(key); }
    groups.get(key)!.push({ ...v, direction: v.direction ?? (i === 0 ? "outbound" : v.direction) });
  });
  return ordem.map((key) => {
    const items = groups.get(key)!;
    const dir: "OUTBOUND" | "INBOUND" = key.endsWith("INBOUND") ? "INBOUND" : "OUTBOUND";
    return buildLeg(items, dir);
  });
}


function hotelProduct(item: PublicQuoteItem, index: number): HotelProduct {
  const info = item.hotel_info ?? null;
  const nome = item.hotel_name ?? info?.name ?? item.title;
  const manual = (item.photo_url ?? "").trim();
  const fotos = [...(manual ? [manual] : []), ...(info?.photos ?? [])];
  return {
    id: `hotel-${index + 1}`,
    name: nome,
    stars: item.hotel_stars ?? null,
    place: info?.address ?? null,
    photos: fotos,

    checkIn: brDate(item.check_in),
    checkOut: brDate(item.check_out),
    occupancy: item.nights ? `${item.nights} noite${item.nights > 1 ? "s" : ""}` : null,
    mealPlan: item.meal_plan ?? null,
    benefits: info?.amenities ?? [],
    roomName: null,
    roomDescription: item.notes ?? info?.description ?? null,
    location: info?.address
      ? { latitude: null, longitude: null, address: info.address, nearbyPlaces: [] }
      : null,
    mapsUrl: info?.address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${nome} ${info.address}`)}`
      : null,
  };
}

function otherProduct(item: PublicQuoteItem, index: number): SimpleProduct {
  const periodo = [brDate(item.date_from), brDate(item.date_to)].filter(Boolean).join(" → ");
  return {
    id: `srv-${index + 1}`,
    title: item.title,
    summary: periodo || item.category || null,
    details: [
      ...(item.category ? [{ label: "Categoria", value: item.category }] : []),
      ...(periodo ? [{ label: "Período", value: periodo }] : []),
    ],
    description: item.notes ?? null,
  };
}

function buildPaymentFromConfig(type: QuoteType, total: number, cfg: QuoteConfig, airline?: string | null): PaymentConfiguration {
  const pixPct = cfg.pix.enabled ? cfg.pix.discount_pct : 0;
  const cardMax = Math.max(1, cfg.card.max_installments);
  const card: Installment[] = cardInstallments(total, airline)
    .slice(0, cardMax)
    .map((i) => ({
      ...i,
      interestFree: cfg.card.interest_from == null ? true : i.number < cfg.card.interest_from,
    }));
  // Regra oficial: somente pacote pode ter boleto.
  const boletoEnabled = type === "TRIP_PACKAGE" && cfg.boleto.enabled;
  const methods: PaymentConfiguration["methods"] = [];
  if (cfg.card.enabled) methods.push("CARD");
  if (boletoEnabled) methods.push("BOLETO");
  if (cfg.pix.enabled) methods.push("PIX");

  return {
    methods: methods.length ? methods : ["CARD", "PIX"],
    card: { enabled: cfg.card.enabled, brands: ["Visa", "Mastercard", "Elo", "Amex", "Hipercard"], installments: card },
    boleto: {
      enabled: boletoEnabled,
      installments: boletoEnabled ? boletoInstallments(total, cfg.boleto.max_installments) : [],
      note: boletoEnabled ? "Parcelamento no boleto sujeito a aprovação." : null,
    },
    pix: {
      enabled: cfg.pix.enabled,
      discountPercent: cfg.pix.enabled ? (pixPct || PIX_DISCOUNT_PERCENT) : 0,
      total: round2(total * (1 - (pixPct || 0) / 100)),
    },
  };
}

/** Converte o orçamento do pedido no modelo público oficial. */
export function buildPublicQuoteFromOrder(legacy: LegacyQuote, token: string): PremiumQuote {
  const voos = legacy.items.filter((i) => i.kind === "flight");
  const hoteis = legacy.items.filter((i) => i.kind === "hotel");
  const outros = legacy.items.filter((i) => i.kind === "other");

  const type: QuoteType = hoteis.length === 0 && outros.length === 0 && voos.length > 0 ? "AIR_ONLY" : "TRIP_PACKAGE";

  const products: QuoteProducts = {};
  if (voos.length) {
    products.flights = [{ id: "air-1", optionId: "1", legs: voos.map(flightLeg) }];
  }
  if (hoteis.length) products.hotels = hoteis.map(hotelProduct);
  if (outros.length) products.services = outros.map(otherProduct);

  const total = Number(legacy.totalPrice) || 0;
  const payment = buildPaymentFromConfig(type, total, legacy.config, voos[0]?.airline ?? null);

  const summary: QuoteSummaryLine[] = [];
  if (voos.length) summary.push({ icon: "flight", label: "Passagens aéreas", value: `${voos.length} trecho(s)` });
  for (const h of hoteis) {
    summary.push({
      icon: "hotel",
      label: h.hotel_name ?? h.title,
      value: [brDate(h.check_in), brDate(h.check_out)].filter(Boolean).join(" → ") || "Hospedagem",
    });
  }
  for (const o of outros) summary.push({ icon: "service", label: o.title, value: o.category ?? "Incluso" });

  const primeiraData =
    isoDate(voos[0]?.departure_at) ?? isoDate(hoteis[0]?.check_in) ?? isoDate(outros[0]?.date_from);
  const ultimaData =
    isoDate(voos[voos.length - 1]?.arrival_at) ?? isoDate(hoteis[0]?.check_out) ?? isoDate(outros[0]?.date_to);

  const destino =
    legacy.destination ??
    voos.find((v) => v.direction !== "return")?.to_city ??
    hoteis[0]?.hotel_name ??
    "Sua viagem";
  const origem = voos.find((v) => v.direction !== "return")?.from_city ?? null;
  const idaEVolta = voos.some((v) => v.direction === "return");

  return {
    id: token,
    publicId: token,
    shortUrl: null,
    type,
    title: legacy.tripTitle ?? (origem ? `${origem} → ${destino}` : destino),
    subtitle: legacy.customerFirstName ? `Orçamento para ${legacy.customerFirstName}` : null,
    origin: origem,
    destination: destino,
    startDate: primeiraData,
    endDate: ultimaData,
    nights: hoteis[0]?.nights ?? null,
    tripKind: voos.length ? (idaEVolta ? "Ida e volta" : "Somente ida") : null,
    cabin: null,
    passengers: {
      adults: legacy.travelers.adults,
      children: legacy.travelers.children,
      infants: 0,
      label: [
        `${legacy.travelers.adults} ${legacy.travelers.adults === 1 ? "adulto" : "adultos"}`,
        legacy.travelers.children
          ? `${legacy.travelers.children} ${legacy.travelers.children === 1 ? "criança" : "crianças"}`
          : null,
      ]
        .filter(Boolean)
        .join(" • "),
    },
    products,
    payment,
    totals: { products: total, taxes: 0, total, pixTotal: payment.pix.total },
    summary,
    agent: {
      name: legacy.agency.name,
      photoUrl: null,
      phone: legacy.agency.phone || null,
      whatsapp: legacy.agency.whatsapp || null,
      email: legacy.agency.email || null,
    },
    source: { type: "SYSTEM", conversationId: null },
    validUntil: legacy.config.valid_until,
    expired: false,
    publicNotes: legacy.config.notes || null,
    createdAt: legacy.createdAt,
    updatedAt: legacy.createdAt,
  };
}
