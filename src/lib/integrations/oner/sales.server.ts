/**
 * Carrinho em acompanhamento, lista de vendas e detalhe da venda.
 * A ligação entre o pedido F-... e a venda é sempre por identificador —
 * nome do passageiro e valor só entram como último recurso.
 * SERVER-ONLY.
 */
import { ONER_API } from "./config";
import { arr, num, onerFetch, pick, procurarFundo } from "./client.server";
import { registrarEvento } from "./store.server";

/** Candidatos de endpoint da área logada, na ordem de preferência. */
const ENDPOINTS = {
  shoppingCart: [
    `${ONER_API}/api/order/v1/orders?page=1&pageSize=50`,
    `${ONER_API}/api/user-area/v1/shopping-cart?page=1&pageSize=50`,
    `${ONER_API}/api/checkout/v1/orders?page=1&pageSize=50`,
  ],
  sales: [
    `${ONER_API}/api/sale/v1/sales?page=1&pageSize=50`,
    `${ONER_API}/api/user-area/v1/sales?page=1&pageSize=50`,
    `${ONER_API}/api/order/v1/sales?page=1&pageSize=50`,
  ],
  saleDetail: (id: string) => [
    `${ONER_API}/api/sale/v1/sales/${id}`,
    `${ONER_API}/api/user-area/v1/sales-detail/${id}`,
    `${ONER_API}/api/sale/v1/sale-detail/${id}`,
  ],
};

async function primeiroQueResponde(
  urls: string[],
  token: string,
  integrationOrderId: string | null,
  rotulo: string,
) {
  for (const url of urls) {
    const r = await onerFetch(url, { token });
    await registrarEvento({
      integrationOrderId,
      eventType: `oner_${rotulo}_attempt`,
      message: `GET ${url} → ${r.call.status}`,
      payload: { call: r.call },
    });
    if (r.call.ok && r.body) return r;
  }
  return null;
}

function textoTem(obj: unknown, alvo: string): boolean {
  try {
    return JSON.stringify(obj).toUpperCase().includes(alvo.toUpperCase());
  } catch {
    return false;
  }
}

/** Situação do pedido enquanto ele ainda está no carrinho do fornecedor. */
export async function consultarCarrinhoFornecedor(
  token: string,
  orderNumber: string,
  integrationOrderId: string | null = null,
) {
  const r = await primeiroQueResponde(ENDPOINTS.shoppingCart, token, integrationOrderId, "shopping_cart");
  if (!r) return { encontrado: false, status: null, item: null };
  const itens = arr(pick(r.body, "data.items", "data", "items", "result")) ;
  const item = itens.find((i) => textoTem(i, orderNumber)) ?? null;
  const status = item
    ? String(pick(item, "status.description", "statusDescription", "status", "situation") ?? "")
    : null;
  if (item) {
    await registrarEvento({
      integrationOrderId,
      eventType: "oner_cart_status",
      message: `Pedido ${orderNumber} no carrinho: ${status || "sem status"}`,
      payload: { item },
    });
  }
  return { encontrado: Boolean(item), status, item };
}

/** Procura a venda correspondente ao pedido F-... e devolve o saleId. */
export async function localizarVenda(
  token: string,
  orderNumber: string,
  integrationOrderId: string | null = null,
) {
  const r = await primeiroQueResponde(ENDPOINTS.sales, token, integrationOrderId, "sales");
  if (!r) return { saleId: null as string | null, venda: null as unknown };
  const itens = arr(pick(r.body, "data.items", "data", "items", "result"));
  const venda = itens.find((v) => textoTem(v, orderNumber)) ?? null;
  if (!venda) return { saleId: null, venda: null };
  const saleId =
    (pick(venda, "saleId", "id", "saleIdentifier", "saleCode") as string | number | undefined) ??
    (procurarFundo(venda, (v, k) => /saleid$/i.test(k) && (typeof v === "string" || typeof v === "number")) as
      | string
      | number
      | undefined);
  const idTexto = saleId != null ? String(saleId) : null;
  await registrarEvento({
    integrationOrderId,
    eventType: "oner_sale_found",
    message: idTexto ? `Venda localizada — saleId ${idTexto}` : "Venda localizada sem identificador",
    payload: { venda },
  });
  return { saleId: idTexto, venda };
}

export type DetalheVenda = {
  status: string | null;
  locator: string | null;
  hotelLocator: string | null;
  compradoEm: string | null;
  passageiros: Array<{ nome: string; documento?: string | null }>;
  bilhetes: Array<{
    passengerName: string | null;
    ticketNumber: string | null;
    pnr: string | null;
    airline: string | null;
    status: string | null;
  }>;
  documentos: Array<{ nome: string; url: string }>;
  bruto: unknown;
};

/** Extrai localizador, bilhetes, passageiros e documentos do detalhe. */
export function interpretarDetalhe(body: unknown): DetalheVenda {
  const d = (pick(body, "data") ?? body) as Record<string, unknown>;

  const locator =
    (pick(d, "locator", "recordLocator", "pnr", "reservationCode", "bookingCode") as string | undefined) ??
    (procurarFundo(d, (v, k) =>
      typeof v === "string" && /^(locator|recordlocator|pnr|reservationcode|bookingcode)$/i.test(k) && v.length >= 5,
    ) as string | undefined) ??
    null;

  const hotelLocator =
    (procurarFundo(d, (v, k) =>
      typeof v === "string" && /hotel.*(locator|confirmation)|confirmationnumber/i.test(k) && v.length >= 4,
    ) as string | undefined) ?? null;

  const passageirosBrutos = arr(
    pick(d, "passengers", "travelers", "flight.passengers", "reservation.passengers"),
  );
  const passageiros = passageirosBrutos.map((p) => ({
    nome: String(
      pick(p, "fullName", "name") ??
        `${pick(p, "firstName") ?? ""} ${pick(p, "lastName") ?? ""}`.trim(),
    ),
    documento: (pick(p, "documentNumber", "document", "cpf") as string | undefined) ?? null,
  }));

  const bilhetes: DetalheVenda["bilhetes"] = [];
  for (const p of passageirosBrutos) {
    const numeroBilhete =
      (pick(p, "ticketNumber", "eTicket", "eTicketNumber", "ticket") as string | undefined) ??
      (procurarFundo(p, (v, k) => typeof v === "string" && /ticket/i.test(k) && /\d{10,}/.test(v)) as
        | string
        | undefined);
    if (!numeroBilhete && !locator) continue;
    bilhetes.push({
      passengerName:
        String(
          pick(p, "fullName", "name") ??
            `${pick(p, "firstName") ?? ""} ${pick(p, "lastName") ?? ""}`.trim(),
        ) || null,
      ticketNumber: numeroBilhete ?? null,
      pnr: (pick(p, "locator", "pnr") as string | undefined) ?? locator,
      airline: (pick(p, "airline", "airlineName", "validatingCarrier") as string | undefined) ?? null,
      status: (pick(p, "ticketStatus", "status") as string | undefined) ?? null,
    });
  }

  const documentos: DetalheVenda["documentos"] = [];
  const coletarDocs = (v: unknown, k = "", nivel = 0) => {
    if (nivel > 6) return;
    if (typeof v === "string" && /^https?:\/\//i.test(v) && /(voucher|ticket|pdf|receipt|document)/i.test(`${k}${v}`)) {
      documentos.push({ nome: k || "documento", url: v });
      return;
    }
    if (Array.isArray(v)) return v.forEach((x) => coletarDocs(x, k, nivel + 1));
    if (v && typeof v === "object") {
      for (const [kk, vv] of Object.entries(v as Record<string, unknown>)) coletarDocs(vv, kk, nivel + 1);
    }
  };
  coletarDocs(d);

  return {
    status: (pick(d, "status.description", "statusDescription", "status") as string | undefined) ?? null,
    locator,
    hotelLocator,
    compradoEm: (pick(d, "purchaseDate", "createdAt", "saleDate") as string | undefined) ?? null,
    passageiros,
    bilhetes,
    documentos,
    bruto: d,
  };
}

export async function lerDetalheVenda(
  token: string,
  saleId: string,
  integrationOrderId: string | null = null,
) {
  const r = await primeiroQueResponde(
    ENDPOINTS.saleDetail(saleId),
    token,
    integrationOrderId,
    "sale_detail",
  );
  if (!r) return null;
  const detalhe = interpretarDetalhe(r.body);
  await registrarEvento({
    integrationOrderId,
    eventType: "oner_sale_detail",
    message: `Detalhe da venda ${saleId} carregado${detalhe.locator ? ` — localizador ${detalhe.locator}` : ""}`,
    payload: { status: detalhe.status, bilhetes: detalhe.bilhetes.length },
  });
  return detalhe;
}

/** Valor total informado pelo fornecedor, quando presente. */
export function valorDoDetalhe(detalhe: DetalheVenda): number | null {
  return num(pick(detalhe.bruto, "totalPrice", "total", "amount", "price.totalPrice"));
}
