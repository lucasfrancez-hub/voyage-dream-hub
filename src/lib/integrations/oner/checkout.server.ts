/**
 * Carrinho, passageiros e criação do pedido F-... na Comprar Viagem.
 * SERVER-ONLY. Toda resposta relevante é registrada em integration_events
 * para servir de documentação do mapeamento.
 */
import { ONER_API, extrairNumeroPedido } from "./config";
import { arr, num, onerFetch, pick, procurarFundo } from "./client.server";
import { registrarEvento } from "./store.server";

/**
 * Trava do fluxo de cartão: a comissão original é preservada integralmente.
 * Nada aqui usa "Aplicar desconto/acréscimo" — zerar comissão só acontece
 * à mão, pela equipe, e apenas no fluxo Pix manual.
 */
export function garantirComissaoPreservada(op: {
  payment_method?: string | null;
  commission_amount?: number | null;
}) {
  if ((op.payment_method ?? "CARD") !== "CARD") return;
  if (op.commission_amount != null && Number(op.commission_amount) <= 0) {
    throw new Error("Comissão zerada em pagamento com cartão — operação bloqueada.");
  }
}

export function extrairCartId(entrada: string): string | null {

  const m = String(entrada ?? "").match(
    /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/,
  );
  return m ? m[0].toLowerCase() : null;
}

export function normalizarNascimento(data: string): string {
  const d = String(data ?? "").trim();
  if (d.includes("T")) return d;
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return `${d}T00:00:00.000Z`;
  return d;
}

export type ResumoCarrinho = {
  cartId: string | null;
  expirado: boolean | null;
  total: number | null;
  moeda: string | null;
  adultos: number | null;
  criancas: number | null;
  bebes: number | null;
  trechos: Array<{ trecho: string; data: string; cia: string; voo: string }>;
  passageirosPersistidos: boolean;
};

export function resumirCarrinho(payload: unknown): ResumoCarrinho {
  const d = (pick(payload, "data") ?? payload) as Record<string, unknown>;
  const flight = (pick(d, "flight") ?? {}) as Record<string, unknown>;
  const price = (pick(flight, "price") ?? {}) as Record<string, unknown>;
  const trechos: ResumoCarrinho["trechos"] = [];

  for (const j of arr(pick(flight, "journeys"))) {
    for (const s of arr(pick(j, "segments", "flightSegments", "legs"))) {
      const de = String(pick(s, "departureAirport.iata", "departure.iata", "origin", "from") ?? "");
      const para = String(pick(s, "arrivalAirport.iata", "arrival.iata", "destination", "to") ?? "");
      trechos.push({
        trecho: `${de || "?"} → ${para || "?"}`,
        data: String(pick(s, "departure.date", "departureDate", "departureDateTime") ?? ""),
        cia: String(pick(s, "airline.name", "airlineName", "marketingAirline.name") ?? ""),
        voo: String(pick(s, "flightNumber", "number") ?? ""),
      });
    }
  }

  const contagem = (pick(price, "passengerCount") ?? {}) as Record<string, unknown>;
  const passageiros = arr(pick(flight, "passengers", "passengers"));

  return {
    cartId: (pick(d, "cartId", "id") as string | undefined) ?? null,
    expirado: (pick(d, "cartExpired", "expired") as boolean | undefined) ?? null,
    total: num(pick(price, "totalPrice", "total", "totalAmount")) ?? num(pick(d, "totalPrice")),
    moeda: (pick(d, "currency", "currencyCode") as string | undefined) ?? "BRL",
    adultos: num(contagem["ADT"]),
    criancas: num(contagem["CHD"]),
    bebes: num(contagem["INF"]),
    trechos,
    passageirosPersistidos:
      passageiros.length > 0 && passageiros.every((p) => Boolean(pick(p, "firstName", "name"))),
  };
}

/** Lê o carrinho da Oner e devolve o resumo + resposta crua (para mapeamento). */
export async function lerCarrinho(cartId: string, token: string, integrationOrderId?: string) {
  const r = await onerFetch(`${ONER_API}/api/checkout/v1/booking/${cartId}`, { token });
  const resumo = r.body ? resumirCarrinho(r.body) : null;
  await registrarEvento({
    integrationOrderId: integrationOrderId ?? null,
    eventType: "oner_cart_read",
    message: `Carrinho consultado (${r.call.status})`,
    payload: { call: r.call, resumo },
  });
  return { call: r.call, resumo, body: r.body, raw: r.raw.slice(0, 20_000) };
}

export type PassageiroOner = {
  firstName: string;
  lastName: string;
  documentNumber: string;
  documentTypeId: number;
  dateOfBirth: string;
  gender: number;
  nationalityCountryId: number;
  passengerTypeCode: string;
  typeCode: string;
  title: string;
  contact: { emailAddress: string; ddi: number; phoneNumber: string };
};

/** Envia os passageiros já preenchidos no portal VIA AIR. */
export async function enviarPassageiros(
  cartId: string,
  passageiros: PassageiroOner[],
  token: string,
  integrationOrderId?: string,
) {
  const body = {
    cartId,
    passengers: passageiros.map((p) => ({ ...p, dateOfBirth: normalizarNascimento(p.dateOfBirth) })),
  };
  const r = await onerFetch<{ success?: boolean; message?: string }>(
    `${ONER_API}/api/booking/flight/passenger/${cartId}`,
    { method: "PUT", body, token },
  );
  const ok = Boolean(r.body?.success) && r.call.ok;
  await registrarEvento({
    integrationOrderId: integrationOrderId ?? null,
    eventType: "oner_passengers_sent",
    message: ok ? "Passageiros enviados ao fornecedor" : `Falha ao enviar passageiros: ${r.call.message ?? ""}`,
    payload: { call: r.call, quantidade: passageiros.length },
  });
  return { ok, call: r.call };
}

/**
 * Confere o valor atual do carrinho contra o valor mostrado ao cliente.
 * Não altera nada: apenas informa se mudou.
 */
export async function revalidarPreco(
  cartId: string,
  token: string,
  valorEsperado: number,
  integrationOrderId?: string,
) {
  const { resumo, call } = await lerCarrinho(cartId, token, integrationOrderId);
  const atual = resumo?.total ?? null;
  const mudou = atual != null && Math.abs(atual - valorEsperado) > 0.01;
  await registrarEvento({
    integrationOrderId: integrationOrderId ?? null,
    eventType: "oner_price_check",
    message: mudou
      ? `Valor mudou: de ${valorEsperado} para ${atual}`
      : `Valor confirmado em ${atual ?? "desconhecido"}`,
    payload: { valorEsperado, valorAtual: atual, status: call.status },
  });
  return { mudou, valorAtual: atual, valorEsperado, expirado: resumo?.expirado ?? null };
}

/**
 * Cria o pedido no fornecedor e captura o número F-...
 * O endpoint exato é confirmado no mapeamento; tentamos os candidatos
 * conhecidos e guardamos a resposta crua de cada tentativa.
 */
export async function criarPedido(cartId: string, token: string, integrationOrderId?: string) {
  const candidatos = [
    { url: `${ONER_API}/api/checkout/v1/order/${cartId}`, method: "POST" },
    { url: `${ONER_API}/api/order/v1/order`, method: "POST", body: { cartId } },
    { url: `${ONER_API}/api/checkout/v1/booking/${cartId}/order`, method: "POST" },
  ];
  for (const c of candidatos) {
    const r = await onerFetch(c.url, { method: c.method, body: c.body, token });
    await registrarEvento({
      integrationOrderId: integrationOrderId ?? null,
      eventType: "oner_order_attempt",
      message: `${c.method} ${c.url} → ${r.call.status}`,
      payload: { call: r.call, resposta: r.raw.slice(0, 4000) },
    });
    if (!r.call.ok) continue;
    const numero =
      extrairNumeroPedido(r.raw) ??
      (procurarFundo(r.body, (v, k) =>
        typeof v === "string" && /order/i.test(k) && /^F-/i.test(v),
      ) as string | undefined) ??
      null;
    if (numero) {
      await registrarEvento({
        integrationOrderId: integrationOrderId ?? null,
        eventType: "oner_order_created",
        message: `Pedido ${numero} criado`,
      });
      return { ok: true, orderNumber: numero, body: r.body, call: r.call };
    }
    return { ok: true, orderNumber: null, body: r.body, call: r.call };
  }
  return { ok: false, orderNumber: null, body: null, call: null };
}
