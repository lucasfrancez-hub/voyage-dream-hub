/**
 * Identificadores opacos da API: a Sky Hub nunca vê searchKey, flightKey,
 * fareId, itineraryId nem cartId — só offerId / checkoutId / paymentId.
 * SERVER-ONLY.
 */
import { randomBytes } from "node:crypto";

export type OfferPayload = {
  searchKey: string;
  fareId: string;
  itineraryId: string;
  leg: "outbound" | "inbound";
  /** Multitrecho: número da perna (1, 2, 3...) e pesquisa a que pertence. */
  sequence?: number;
  searchId?: string;
  contexto: {
    departureIata: string;
    arrivalIata: string;
    departureDate: string;
    returnDate?: string | null;
    adults: number;
    children: number;
    infants: number;
    departureIsCity?: boolean;
    arrivalIsCity?: boolean;
  };
  resumo: Record<string, unknown>;
};

function id(prefixo: string): string {
  return `${prefixo}_${randomBytes(16).toString("base64url").replace(/[^A-Za-z0-9]/g, "").slice(0, 24)}`;
}

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function guardarOfertas(args: {
  clientId: string;
  searchId: string;
  leg: "outbound" | "inbound";
  ofertas: OfferPayload[];
}): Promise<string[]> {
  if (args.ofertas.length === 0) return [];
  const supabase = await db();
  const ids = args.ofertas.map(() => id("off"));
  const linhas = args.ofertas.map((payload, i) => ({
    id: undefined,
    api_client_id: args.clientId,
    search_id: args.searchId,
    kind: `offer:${ids[i]}`,
    payload: payload as never,
  }));
  await supabase.from("api_offer_refs").insert(linhas.map(({ id: _i, ...r }) => r) as never);
  return ids;
}

export async function lerOferta(offerId: string): Promise<OfferPayload | null> {
  const supabase = await db();
  const { data } = await supabase
    .from("api_offer_refs")
    .select("payload,expires_at")
    .eq("kind", `offer:${offerId}`)
    .maybeSingle();
  const row = data as { payload: OfferPayload; expires_at: string } | null;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  return row.payload;
}

/* ------------------------------------------------------------------ */
/* checkoutId  <->  cartId                                              */
/* ------------------------------------------------------------------ */

export async function criarCheckoutRef(args: {
  clientId: string;
  cartId: string;
  contexto: Record<string, unknown>;
}): Promise<string> {
  const checkoutId = id("chk");
  const supabase = await db();
  await supabase.from("api_offer_refs").insert({
    api_client_id: args.clientId,
    search_id: args.cartId,
    kind: `checkout:${checkoutId}`,
    payload: { cartId: args.cartId, contexto: args.contexto } as never,
    expires_at: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
  } as never);
  return checkoutId;
}

export async function lerCheckoutRef(
  checkoutId: string,
): Promise<{ cartId: string; contexto: Record<string, unknown> } | null> {
  const supabase = await db();
  const { data } = await supabase
    .from("api_offer_refs")
    .select("payload")
    .eq("kind", `checkout:${checkoutId}`)
    .maybeSingle();
  const row = data as { payload: { cartId: string; contexto: Record<string, unknown> } } | null;
  return row?.payload ?? null;
}

/* ------------------------------------------------------------------ */
/* Orçamento público -> chaves de tarifa (para gerar o carrinho depois) */
/* ------------------------------------------------------------------ */

export type QuoteCartRef = {
  searchKey: string;
  contexto: OfferPayload["contexto"];
  opcoes: Array<{
    opcao: number;
    outboundFareId: string;
    outboundItineraryId: string;
    inboundFareId: string | null;
    inboundItineraryId: string | null;
    isRoundTrip: boolean;
  }>;
};

export async function guardarCarrinhoDoOrcamento(publicId: string, ref: QuoteCartRef): Promise<void> {
  const supabase = await db();
  await supabase.from("api_offer_refs").insert({
    search_id: publicId,
    kind: `quotecart:${publicId}`,
    payload: ref as never,
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  } as never);
}

export async function lerCarrinhoDoOrcamento(publicId: string): Promise<QuoteCartRef | null> {
  const supabase = await db();
  const { data } = await supabase
    .from("api_offer_refs")
    .select("payload")
    .eq("kind", `quotecart:${publicId}`)
    .maybeSingle();
  return ((data as { payload: QuoteCartRef } | null)?.payload ?? null) as QuoteCartRef | null;
}

export function novoSearchId(): string {
  return id("srh");
}

/** Pesquisa multitrecho. */
export function novoSearchIdMulticity(): string {
  return id("mcs");
}

/** Grupo multitrecho (conjunto de checkouts). */
export function novoGroupId(): string {
  return id("grp");
}
