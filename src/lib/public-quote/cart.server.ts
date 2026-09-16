/**
 * Carrinho da operadora (Oner / Comprar Viagem) a partir de um orçamento
 * público AIR_ONLY.
 *
 * O orçamento público guarda apenas o que o cliente vê; as chaves de tarifa
 * ficam no payload da pesquisa (wa_flight_quotes). Aqui juntamos as duas
 * pontas e devolvemos a URL do carrinho pra o cliente comprar a viagem.
 *
 * SERVER-ONLY.
 */

type CartKeys = {
  outboundFareId: string;
  outboundItineraryId: string;
  inboundFareId: string | null;
  inboundItineraryId: string | null;
};

type OpcaoPayload = {
  opcao?: number;
  cart?: CartKeys;
  volta?: unknown;
};

type Payload = {
  search_key?: string | null;
  origem_iata?: string | null;
  destino_iata?: string | null;
  data_ida?: string | null;
  data_volta?: string | null;
  passageiros?: { adultos?: number; criancas?: number; bebes?: number } | null;
  opcoes?: OpcaoPayload[];
};

export async function criarCarrinhoDoOrcamento(params: {
  publicId: string;
  opcao?: number | null;
}): Promise<{ url: string } | { url: null; motivo: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: row } = await supabaseAdmin
    .from("public_quotes")
    .select("quote_id, option_index, quote_type")
    .eq("public_id", params.publicId)
    .maybeSingle();

  // Orçamentos criados pela Internal API não nascem de uma pesquisa do
  // WhatsApp: as chaves de tarifa ficam guardadas junto do próprio link.
  if (!row?.quote_id) {
    const alternativo = await carrinhoPorChavesDoOrcamento(params);
    if (alternativo) return alternativo;
    return { url: null, motivo: "Orçamento sem pesquisa vinculada." };
  }

  const { data: fq } = await supabaseAdmin
    .from("wa_flight_quotes")
    .select("payload")
    .eq("id", row.quote_id)
    .maybeSingle();

  const payload = (fq?.payload ?? null) as Payload | null;
  const opcoes = payload?.opcoes ?? [];
  if (!payload?.search_key || !opcoes.length) {
    const alternativo = await carrinhoPorChavesDoOrcamento(params);
    if (alternativo) return alternativo;
    return { url: null, motivo: "Pesquisa sem chaves de tarifa." };
  }

  const numero = Number(params.opcao ?? row.option_index ?? 1) || 1;
  const opt =
    opcoes.find((o) => Number(o?.opcao) === numero) ?? opcoes[Math.min(numero, opcoes.length) - 1];
  const cart = opt?.cart;
  if (!cart?.outboundFareId || !cart?.outboundItineraryId) {
    return { url: null, motivo: "Opção sem tarifa da operadora." };
  }

  const pax = payload.passageiros ?? {};
  const { createFlightCart } = await import("@/lib/onertravel.server");
  const criado = await createFlightCart({
    searchKey: payload.search_key,
    outboundFareId: cart.outboundFareId,
    outboundItineraryId: cart.outboundItineraryId,
    inboundFareId: cart.inboundFareId ?? null,
    inboundItineraryId: cart.inboundItineraryId ?? null,
    isRoundTrip: !!opt?.volta,
    departureIata: payload.origem_iata ?? null,
    arrivalIata: payload.destino_iata ?? null,
    departureDate: payload.data_ida ?? null,
    returnDate: payload.data_volta ?? null,
    adults: Math.max(1, Number(pax.adultos) || 1),
    children: Math.max(0, Number(pax.criancas) || 0),
    infants: Math.max(0, Number(pax.bebes) || 0),
    departureIsCity: false,
    arrivalIsCity: false,
    preferInboundFare: false,
  } as never);

  return { url: checkoutViaAir(criado.cartId) };
}

/** Checkout da própria VIA AIR — o cliente nunca é mandado pro site da operadora. */
function checkoutViaAir(cartId: string): string {
  return `https://pedidos.viaair.tur.br/checkout/voo/${String(cartId).toLowerCase()}`;
}

/**
 * Caminho dos orçamentos criados pela Internal API: as chaves de tarifa de
 * cada opção ficam guardadas no servidor junto do link público.
 */
async function carrinhoPorChavesDoOrcamento(params: {
  publicId: string;
  opcao?: number | null;
}): Promise<{ url: string } | null> {
  const { lerCarrinhoDoOrcamento } = await import("@/lib/api/refs.server");
  const ref = await lerCarrinhoDoOrcamento(params.publicId);
  if (!ref?.searchKey || !ref.opcoes?.length) return null;

  const numero = Number(params.opcao ?? 1) || 1;
  const opt =
    ref.opcoes.find((o) => Number(o.opcao) === numero) ??
    ref.opcoes[Math.min(numero, ref.opcoes.length) - 1];
  if (!opt?.outboundFareId || !opt?.outboundItineraryId) return null;

  const ctx = ref.contexto ?? ({} as (typeof ref)["contexto"]);
  const { createFlightCart } = await import("@/lib/onertravel.server");
  const criado = await createFlightCart({
    searchKey: ref.searchKey,
    outboundFareId: opt.outboundFareId,
    outboundItineraryId: opt.outboundItineraryId,
    inboundFareId: opt.inboundFareId ?? null,
    inboundItineraryId: opt.inboundItineraryId ?? null,
    isRoundTrip: !!opt.isRoundTrip,
    departureIata: ctx.departureIata ?? null,
    arrivalIata: ctx.arrivalIata ?? null,
    departureDate: ctx.departureDate ?? null,
    returnDate: ctx.returnDate ?? null,
    adults: Math.max(1, Number(ctx.adults) || 1),
    children: Math.max(0, Number(ctx.children) || 0),
    infants: Math.max(0, Number(ctx.infants) || 0),
    departureIsCity: !!ctx.departureIsCity,
    arrivalIsCity: !!ctx.arrivalIsCity,
    preferInboundFare: false,
  } as never);

  return { url: checkoutViaAir(criado.cartId) };
}
