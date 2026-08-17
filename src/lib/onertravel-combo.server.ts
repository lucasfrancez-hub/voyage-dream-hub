import { z } from "zod";
import { combinedCartUrl } from "@/lib/combined-journey";

const API = "https://api.onertravel.com";
const INSTITUTION_ID = "23";
const AGENT_ID = "83956";

function headers(locationHref: string): Record<string, string> {
  return {
    "content-type": "application/json",
    accept: "application/json, text/plain, */*",
    authorization: "Bearer",
    institutionid: INSTITUTION_ID,
    agentid: AGENT_ID,
    applicationname: "COMPRARVIAGEM",
    applicationaccesstype: "1",
    platform: "WEBAPP",
    language: "4",
    currencie: "1",
    currency: "1",
    ispackage: "false",
    referer: "https://www.comprarviagem.com.br/",
    origin: "https://www.comprarviagem.com.br",
    "x-location-href": locationHref,
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  };
}

export const ComboFlightBooking = z.object({
  searchKey: z.string().min(5),
  outboundFareId: z.string().min(5),
  outboundItineraryId: z.string().min(5),
  inboundFareId: z.string().nullish(),
  inboundItineraryId: z.string().nullish(),
  isRoundTrip: z.boolean().default(false),
  departureIata: z.string().length(3),
  arrivalIata: z.string().length(3),
  departureDate: z.string(),
  returnDate: z.string().nullish(),
  adults: z.number().int().min(1).max(9).default(1),
  children: z.number().int().min(0).max(9).default(0),
  infants: z.number().int().min(0).max(9).default(0),
});

export const ComboHotelBooking = z.object({
  searchKey: z.string().min(5),
  hotelId: z.number().int(),
  rateKeys: z.array(z.string().min(3)).min(1),
  pointId: z.string().default(""),
  pointType: z.number().int().default(1),
  checkIn: z.string(),
  checkOut: z.string(),
  adults: z.number().int().default(2),
  children: z.number().int().default(0),
  rooms: z.number().int().default(1),
});

export type ComboFlightBookingData = z.infer<typeof ComboFlightBooking>;
export type ComboHotelBookingData = z.infer<typeof ComboHotelBooking>;

export const ComboCartInput = z.object({
  flight: ComboFlightBooking,
  hotel: ComboHotelBooking,
  /** Chave única da jornada combinada (mesma usada nas duas pesquisas). */
  combinedKey: z.string().nullish(),
});

/** URL de contexto (a operadora usa isso para montar a busca da página). */
function comboHotelHref(d: z.infer<typeof ComboCartInput>): string {
  const stations = JSON.stringify([
    { departureStation: d.flight.departureIata, arrivalStation: d.flight.arrivalIata },
  ]);
  const rooms = JSON.stringify(
    Array.from({ length: Math.max(1, d.hotel.rooms) }, () => ({
      numberOfAdults: Math.max(1, Math.ceil(d.hotel.adults / Math.max(1, d.hotel.rooms))),
      numberOfChilds: 0,
      agesOfChild: [],
    })),
  );
  const q = new URLSearchParams({
    type: String(d.hotel.pointType),
    id: d.hotel.pointId,
    startDate: `${d.hotel.checkIn}T00:00:00Z`,
    endDate: `${d.hotel.checkOut}T00:00:00Z`,
    isPackage: "false",
    source: "h",
    // Jornada combinada: a chave da jornada manda; sem ela, a da busca de hotel.
    searchKey: d.combinedKey || d.hotel.searchKey,
  });
  q.set("rooms", encodeURIComponent(rooms));
  q.set("stations", encodeURIComponent(stations));
  return `https://www.comprarviagem.com.br/viaair/combined/hotel?${q.toString()}`;
}

/**
 * Cria o carrinho combinado e devolve /viaair/combined/cart?cartId=...&source=p
 */
export async function buildComboCart(
  data: z.infer<typeof ComboCartInput>,
): Promise<{ cartId: string; url: string }> {
  const loc = comboHotelHref(data);

  const roomSel = (
    data.hotel.rateKeys.length >= data.hotel.rooms
      ? data.hotel.rateKeys.slice(0, data.hotel.rooms)
      : Array.from({ length: data.hotel.rooms }, (_, i) => data.hotel.rateKeys[i] ?? data.hotel.rateKeys[0])
  ).map((key, order) => ({ order, key }));

  const flightBlock = {
    searchKey: data.flight.searchKey,
    fareId: data.flight.outboundFareId,
    fareId2: data.flight.inboundFareId ?? null,
    outboundItineraryId: data.flight.outboundItineraryId,
    inboundItineraryId: data.flight.inboundItineraryId ?? null,
    teenagerCount: 0,
  };
  const hotelBlock = {
    searchKey: data.hotel.searchKey,
    hotelId: data.hotel.hotelId,
    rooms: roomSel,
  };

  const bodies: Record<string, unknown>[] = [
    { flight: flightBlock, hotel: hotelBlock, searchBookingKey: null, affiliateTag: null, eventId: null },
    {
      flight: flightBlock,
      hotel: { ...hotelBlock, rooms: [{ order: 0, key: data.hotel.rateKeys[0] }] },
      searchBookingKey: null,
      affiliateTag: null,
      eventId: null,
    },
  ];
  // Último recurso: algumas jornadas exigem a chave combinada no corpo.
  if (data.combinedKey) {
    bodies.push({
      flight: flightBlock,
      hotel: hotelBlock,
      searchBookingKey: data.combinedKey,
      affiliateTag: null,
      eventId: null,
    });
  }

  let cartId = "";
  let lastStatus = 0;
  for (const body of bodies) {
    const res = await fetch(`${API}/api/booking`, {
      method: "POST",
      headers: headers(loc),
      body: JSON.stringify(body),
    });
    lastStatus = res.status;
    const text = await res.text();
    try {
      cartId = (JSON.parse(text) as { data?: string }).data ?? "";
    } catch {
      cartId = "";
    }
    if (res.ok && cartId) break;
    cartId = "";
  }

  if (!cartId) {
    throw new Error(
      `A operadora não gerou o carrinho aéreo + hotel (tarifa pode ter expirado, HTTP ${lastStatus}). Refaça a busca e tente de novo.`,
    );
  }

  return { cartId, url: combinedCartUrl(cartId) };
}
