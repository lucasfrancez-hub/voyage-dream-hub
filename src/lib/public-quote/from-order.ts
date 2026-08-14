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
import { buildExtendedQuotes, DEFAULT_EXTENDED_MARKUPS } from "@/lib/airfare-conditions";
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

import {
  dateLabelOf,
  durationBetween,
  isoDateOf,
  legLabel,
  splitIntoLegs,
  timeOf,
  directionsFor,
  type LegInputSegment,
} from "./flight-legs";
import { agentPhoto } from "./agents";
import { normalizeServiceTitle } from "./service-title";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function brDate(stampV?: string | null): string | null {
  const iso = isoDateOf(stampV);
  if (!iso) return stampV ? String(stampV) : null;
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

/** "2026-09-10T06:10" -> "2026-09-10 06:10" (formato esperado pelos cards). */
function stamp(v?: string | null): string {
  if (!v) return "";
  const s = String(v).replace("T", " ");
  const m = s.match(/(\d{4}-\d{2}-\d{2})[ ]?(\d{2}:\d{2})?/);
  if (!m) return s;
  return m[2] ? `${m[1]} ${m[2]}` : m[1];
}

/** Item do pedido -> segmento normalizado para o agrupador de trechos. */
function toLegInput(item: PublicQuoteItem): LegInputSegment {
  const fromIata = item.from_iata ?? "";
  const toIata = item.to_iata ?? "";
  return {
    airline: item.airline ?? null,
    flightNumber: item.flight_number ?? null,
    fromIata,
    fromName: item.from_city ?? cityLabel(fromIata) ?? null,
    toIata,
    toName: item.to_city ?? cityLabel(toIata) ?? null,
    departure: item.departure_at ?? null,
    arrival: item.arrival_at ?? null,
    cabin: item.cabin_class ?? null,
    fareFamily: item.fare_class ?? null,
    direction: item.direction === "return" ? "INBOUND" : item.direction === "outbound" ? "OUTBOUND" : null,
    tripGroup: item.trip_group ?? null,
    carryOn: item.carry_on !== false,
    personalItem: item.personal_item !== false,
    checkedBaggage: item.checked_bag === true,
  };
}

function segmentOf(seg: LegInputSegment): FlightSegment {
  return {
    airline: seg.airline ?? "Companhia aérea",
    flightNumber: seg.flightNumber ?? null,
    fromIata: seg.fromIata,
    fromName: seg.fromName ?? null,
    toIata: seg.toIata,
    toName: seg.toName ?? null,
    departure: stamp(seg.departure),
    arrival: stamp(seg.arrival),
    duration: durationBetween(seg.departure, seg.arrival),
    aircraft: seg.aircraft ?? null,
  };
}

/** Monta os trechos reais (ida / volta / multi-trecho) sem unir direções. */
function buildLegs(voos: PublicQuoteItem[]): FlightLeg[] {
  const grupos = splitIntoLegs(voos.map(toLegInput));
  const direcoes = directionsFor(grupos);

  return grupos.map((itens, idx) => {
    const first = itens[0]!;
    const last = itens[itens.length - 1]!;
    const segments = itens.map(segmentOf);
    for (let i = 0; i < segments.length - 1; i++) {
      const espera = durationBetween(itens[i]!.arrival, itens[i + 1]!.departure);
      if (espera) {
        segments[i]!.connectionAfter =
          `Conexão em ${segments[i]!.toName ?? segments[i]!.toIata} • ${espera}`;
      }
    }
    const stops = Math.max(0, itens.length - 1);
    const direction = direcoes[idx]!;
    return {
      direction,
      label: legLabel(direction, idx, grupos.length),
      airline: first.airline ?? "Companhia aérea",
      dateLabel: dateLabelOf(first.departure),
      departureTime: timeOf(first.departure),
      arrivalTime: timeOf(last.arrival),
      fromIata: first.fromIata,
      fromCity: first.fromName ?? null,
      toIata: last.toIata,
      toCity: last.toName ?? null,
      duration: durationBetween(first.departure, last.arrival),
      stops,
      stopsLabel: stops === 0 ? "Direto" : `${stops} ${stops === 1 ? "conexão" : "conexões"}`,
      cabin: first.cabin ?? null,
      fareFamily: first.fareFamily ?? null,
      carryOn: itens.every((i) => i.carryOn !== false),
      personalItem: itens.every((i) => i.personalItem !== false),
      checkedBaggage: itens.every((i) => i.checkedBaggage === true),
      segments,
    } satisfies FlightLeg;
  });
}

/** Regime alimentar e cancelamento entram como benefício visual. */
function hotelBenefits(item: PublicQuoteItem, amenities: string[]): string[] {
  const out: string[] = [];
  if (item.meal_plan) out.push(item.meal_plan);
  for (const a of amenities) {
    if (out.length >= 6) break;
    if (!out.some((x) => x.toLowerCase() === a.toLowerCase())) out.push(a);
  }
  return out;
}

/** "Quarto Standard — 1 cama de casal" a partir dos dados da reserva. */
function roomLabel(item: PublicQuoteItem, hotelName: string): string | null {
  const tipo = (item.room_type ?? item.room_category ?? "").trim();
  const cama = (item.bed_type ?? "").trim();
  if (tipo) {
    const base = /quarto|apartamento|su[ií]te|studio|chal[ée]/i.test(tipo) ? tipo : `Quarto ${tipo}`;
    return cama ? `${base} — ${cama}` : base;
  }
  if (cama) return `Quarto — ${cama}`;
  const t = item.title ?? "";
  return t && t !== hotelName && !/noites?/i.test(t) ? t : null;
}

function hotelProduct(
  item: PublicQuoteItem,
  index: number,
  occupancyLabel: string | null,
): HotelProduct {
  const info = item.hotel_info ?? null;
  const nome = item.hotel_name ?? info?.name ?? item.title;
  const manual = (item.photo_url ?? "").trim();
  const fotos = [...(manual ? [manual] : []), ...(info?.photos ?? [])];
  const lat = info?.latitude ?? null;
  const lng = info?.longitude ?? null;
  const endereco = info?.address ?? null;

  return {
    id: `hotel-${index + 1}`,
    name: nome,
    stars: item.hotel_stars ?? info?.stars ?? null,
    place: endereco,
    photos: fotos,

    checkIn: brDate(item.check_in),
    checkOut: brDate(item.check_out),
    // Ocupação é gente, não noite: as noites aparecem no cabeçalho da seção.
    occupancy: occupancyLabel,
    mealPlan: item.meal_plan ?? null,
    benefits: hotelBenefits(item, info?.amenities ?? []),
    roomName: roomLabel(item, nome),
    roomDescription: item.notes ?? null,
    about: info?.description ?? null,
    rating: info?.rating ?? null,
    reviewsCount: info?.num_reviews ?? null,
    location:
      lat != null || endereco
        ? {
            latitude: lat,
            longitude: lng,
            address: endereco,
            nearbyPlaces: info?.nearby ?? [],
          }
        : null,
    mapsUrl:
      lat != null && lng != null
        ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
        : endereco
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${nome} ${endereco}`)}`
          : null,
  };
}

function otherProduct(item: PublicQuoteItem, index: number): SimpleProduct {
  const periodo = [brDate(item.date_from), brDate(item.date_to)].filter(Boolean).join(" → ");
  const norm = normalizeServiceTitle(item.title);
  return {
    id: `srv-${index + 1}`,
    title: norm.title,
    summary: periodo || item.category || null,
    details: [
      ...(item.category ? [{ label: "Categoria", value: item.category }] : []),
      ...(periodo ? [{ label: "Período", value: periodo }] : []),
      ...(norm.reference ? [{ label: "Referência", value: norm.reference }] : []),
    ],
    description: item.notes ?? null,
  };
}

function buildPaymentFromConfig(
  type: QuoteType,
  total: number,
  cfg: QuoteConfig,
  airline: string | null,
  markups: Record<number, number>,
): PaymentConfiguration {
  // Pix e cartão SEMPRE aparecem no orçamento público.
  const pixPct = cfg.pix.discount_pct || PIX_DISCOUNT_PERCENT;
  const semJuros: Installment[] = cardInstallments(total, airline).map((i) => ({ ...i, interestFree: true }));
  const maxSemJuros = semJuros.length ? semJuros[semJuros.length - 1]!.number : 1;

  // Acima do limite sem juros da cia, usa a tabela de markup do financeiro.
  const comJuros: Installment[] = buildExtendedQuotes(total, markups)
    .filter((q) => q.installments > maxSemJuros)
    .map((q) => ({
      number: q.installments,
      amount: round2(q.installmentValue),
      total: round2(q.total),
      interestFree: false,
    }));

  const card: Installment[] = [...semJuros, ...comJuros];

  // Regra oficial: somente pacote pode ter boleto.
  const boletoEnabled = type === "TRIP_PACKAGE" && cfg.boleto.enabled;
  const methods: PaymentConfiguration["methods"] = ["CARD"];
  if (boletoEnabled) methods.push("BOLETO");
  methods.push("PIX");

  return {
    methods,
    card: { enabled: true, brands: ["Visa", "Mastercard", "Elo", "Amex", "Hipercard"], installments: card },
    boleto: {
      enabled: boletoEnabled,
      installments: boletoEnabled ? boletoInstallments(total, cfg.boleto.max_installments) : [],
      note: boletoEnabled ? "Parcelamento no boleto sujeito a aprovação." : null,
    },
    pix: {
      enabled: true,
      discountPercent: pixPct,
      total: round2(total * (1 - pixPct / 100)),
    },
  };
}

/** Converte o orçamento do pedido no modelo público oficial. */
export function buildPublicQuoteFromOrder(legacy: LegacyQuote, token: string): PremiumQuote {

  const voos = legacy.items.filter((i) => i.kind === "flight");
  const hoteis = legacy.items.filter((i) => i.kind === "hotel");
  const outros = legacy.items.filter((i) => i.kind === "other");

  const type: QuoteType = hoteis.length === 0 && outros.length === 0 && voos.length > 0 ? "AIR_ONLY" : "TRIP_PACKAGE";

  // Passageiros reais do pedido — nunca "2 adultos" fixo.
  const criancas = Math.max(0, Number(legacy.travelers.children) || 0);
  const adultos = Math.max(criancas > 0 ? 0 : 1, Number(legacy.travelers.adults) || 0);
  const paxLabel = [
    adultos ? `${adultos} ${adultos === 1 ? "adulto" : "adultos"}` : null,
    criancas ? `${criancas} ${criancas === 1 ? "criança" : "crianças"}` : null,
  ]
    .filter(Boolean)
    .join(" • ");

  const legs = voos.length ? buildLegs(voos) : [];
  const products: QuoteProducts = {};
  if (legs.length) {
    products.flights = [{ id: "air-1", optionId: "1", legs }];
  }
  if (hoteis.length) products.hotels = hoteis.map((h, i) => hotelProduct(h, i, paxLabel || null));
  if (outros.length) products.services = outros.map(otherProduct);

  const total = Number(legacy.totalPrice) || 0;
  const payment = buildPaymentFromConfig(
    type,
    total,
    legacy.config,
    voos[0]?.airline ?? null,
    legacy.installmentMarkups ?? DEFAULT_EXTENDED_MARKUPS,
  );

  const summary: QuoteSummaryLine[] = [];
  if (legs.length) {
    summary.push({
      icon: "flight",
      label: `Aéreo ${legs.length > 1 ? "ida e volta" : "somente ida"} • ${paxLabel || "passageiros"}`,
      value: "Incluído",
    });
  }

  for (const h of hoteis) {
    summary.push({
      icon: "hotel",
      label: h.nights
        ? `${h.hotel_name ?? h.title} • ${h.nights} ${h.nights > 1 ? "noites" : "noite"}`
        : (h.hotel_name ?? h.title),
      value: [brDate(h.check_in), brDate(h.check_out)].filter(Boolean).join(" → ") || "Incluída",
    });
  }
  for (const o of outros) {
    summary.push({
      icon: normalizeServiceTitle(o.title).icon,
      label: normalizeServiceTitle(o.title).title,
      value: o.category ?? "Incluído",
    });
  }

  const primeiraData =
    isoDateOf(voos[0]?.departure_at) ?? isoDateOf(hoteis[0]?.check_in) ?? isoDateOf(outros[0]?.date_from);
  const ultimaData =
    isoDateOf(voos[voos.length - 1]?.arrival_at) ?? isoDateOf(hoteis[0]?.check_out) ?? isoDateOf(outros[0]?.date_to);

  const destino =
    legacy.destination ??
    voos.find((v) => v.direction !== "return")?.to_city ??
    hoteis[0]?.hotel_name ??
    "Sua viagem";
  const origem = voos.find((v) => v.direction !== "return")?.from_city ?? null;
  const idaEVolta = legs.some((l) => l.direction === "INBOUND");

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
    tripKind: legs.length ? (idaEVolta ? "Ida e volta" : legs.length > 1 ? "Multi-trecho" : "Somente ida") : null,
    cabin: legs[0]?.cabin ?? null,
    passengers: { adults: adultos, children: criancas, infants: 0, label: paxLabel },

    products,
    payment,
    totals: { products: total, taxes: 0, total, pixTotal: payment.pix.total },
    summary,
    agent: {
      name: legacy.agency.name,
      photoUrl: agentPhoto(legacy.agency.name),
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
