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

export type PontoVoo = {
  iata: string;
  cidade: string;
  aeroporto: string;
  data: string; // dd/mm/aaaa
  hora: string; // hh:mm
};

export type SegmentoVoo = {
  voo: string;
  ciaIata: string;
  cia: string;
  logo: string | null;
  familia: string | null;
  saida: PontoVoo;
  chegada: PontoVoo;
};

export type VooResumo = {
  rotulo: string;
  cia: string;
  logo: string | null;
  voo: string;
  duracao: string;
  paradas: number;
  conexoes: string[];
  bagagemMao: string | null;
  saida: PontoVoo;
  chegada: PontoVoo;
  segmentos: SegmentoVoo[];
};

export type ParcelaResumo = {
  installment: number;
  installmentsValue: number;
  total: number;
  interestRate: number;
  hasRate: boolean;
};

export type ResumoCarrinho = {
  cartId: string | null;
  expirado: boolean | null;
  total: number | null;
  tarifa: number | null;
  taxas: number | null;
  moeda: string | null;
  adultos: number | null;
  criancas: number | null;
  bebes: number | null;
  /** Compatibilidade: lista simples de trechos. */
  trechos: Array<{ trecho: string; data: string; cia: string; voo: string }>;
  voos: VooResumo[];
  precos: Array<{ tipo: string; quantidade: number; total: number }>;
  parcelas: ParcelaResumo[];
  passageirosPersistidos: boolean;
};

const pad2 = (n: number) => String(n).padStart(2, "0");

function ponto(origem: unknown): PontoVoo {
  const d = (pick(origem, "date") ?? {}) as { year?: number; month?: number; day?: number };
  const t = (pick(origem, "time") ?? {}) as { hour?: number; minute?: number };
  return {
    iata: String(pick(origem, "iata") ?? ""),
    cidade: String(pick(origem, "city") ?? "").trim(),
    aeroporto: String(pick(origem, "name") ?? "").trim(),
    data: d?.year ? `${pad2(d.day ?? 1)}/${pad2(d.month ?? 1)}/${d.year}` : "",
    hora: t?.hour != null ? `${pad2(t.hour)}:${pad2(t.minute ?? 0)}` : "",
  };
}

export function resumirCarrinho(payload: unknown): ResumoCarrinho {
  const d = (pick(payload, "data") ?? payload) as Record<string, unknown>;
  const flight = (pick(d, "flight") ?? {}) as Record<string, unknown>;
  const price = (pick(flight, "price") ?? {}) as Record<string, unknown>;
  const resumoPedido = (pick(d, "orderSummary") ?? {}) as Record<string, unknown>;
  const trechos: ResumoCarrinho["trechos"] = [];
  const voos: VooResumo[] = [];

  const jornadas = arr(pick(flight, "journeys"));
  jornadas.forEach((j, indice) => {
    const segmentos: SegmentoVoo[] = arr(pick(j, "segments", "flightSegments", "legs")).map((s) => ({
      voo: String(pick(s, "flightNumber", "number") ?? ""),
      cia: String(pick(s, "marketingAirline.name", "airline.name") ?? "").trim(),
      logo: (pick(s, "marketingAirline.pathLogo") as string | undefined) ?? null,
      saida: ponto(pick(s, "departure")),
      chegada: ponto(pick(s, "destination", "arrival")),
    }));

    for (const s of segmentos) {
      trechos.push({
        trecho: `${s.saida.iata || "?"} → ${s.chegada.iata || "?"}`,
        data: [s.saida.data, s.saida.hora].filter(Boolean).join(" "),
        cia: s.cia,
        voo: s.voo,
      });
    }

    const tempo = (pick(j, "flyingTime") ?? {}) as { hour?: number; minute?: number };
    const bagagens = arr(pick(j, "baggagesAllowance"));
    const mao = bagagens.find((b) => Number(pick(b, "type")) === 1);
    const primeiro = segmentos[0];
    const ultimo = segmentos[segmentos.length - 1];

    voos.push({
      rotulo:
        jornadas.length === 2 ? (indice === 0 ? "Ida" : "Volta") : jornadas.length === 1 ? "Ida" : `Trecho ${indice + 1}`,
      cia: String(pick(j, "marketingAirline.name") ?? primeiro?.cia ?? "").trim(),
      logo: (pick(j, "marketingAirline.pathLogo") as string | undefined) ?? primeiro?.logo ?? null,
      voo: primeiro?.voo ?? "",
      duracao:
        tempo?.hour != null || tempo?.minute != null ? `${tempo.hour ?? 0}h${pad2(tempo.minute ?? 0)}` : "",
      paradas: Number(pick(j, "numberOfStops") ?? Math.max(0, segmentos.length - 1)) || 0,
      conexoes: segmentos.slice(0, -1).map((s) => s.chegada.cidade || s.chegada.iata).filter(Boolean),
      bagagemMao: mao
        ? `${pick(mao, "quantity") ?? 1} item de mão${pick(mao, "weight") ? ` até ${pick(mao, "weight")}kg` : ""}`
        : null,
      saida: primeiro?.saida ?? ponto(pick(j, "departure")),
      chegada: ultimo?.chegada ?? ponto(pick(j, "destination")),
      segmentos,
    });
  });

  const contagemBruta = pick(price, "passengerCount");
  const contagem = (typeof contagemBruta === "object" && contagemBruta ? contagemBruta : {}) as Record<
    string,
    unknown
  >;
  const porTipo = arr(pick(price, "farePassengerPrices"));
  const quantidadeDe = (tipo: string) => {
    const item = porTipo.find((p) => String(pick(p, "passengerTypeCode") ?? "") === tipo);
    return num(item ? pick(item, "count") : undefined) ?? num(contagem[tipo]) ?? null;
  };
  const adultos =
    quantidadeDe("ADT") ??
    (typeof contagemBruta === "number" ? Number(contagemBruta) : null) ??
    null;

  const passageiros = arr(pick(flight, "passengers"));

  return {
    cartId: (pick(d, "cartId", "id") as string | undefined) ?? null,
    expirado: (pick(d, "cartExpired", "expired") as boolean | undefined) ?? null,
    total:
      num(pick(resumoPedido, "totalWithDiscount")) ??
      num(pick(price, "totalPrice", "total", "totalAmount")) ??
      num(pick(d, "totalPrice")),
    tarifa: num(pick(price, "price")),
    taxas: num(pick(price, "tax")),
    moeda: (pick(d, "currency", "currencyCode") as string | undefined) ?? "BRL",
    adultos,
    criancas: quantidadeDe("CHD"),
    bebes: quantidadeDe("INF"),
    trechos,
    voos,
    precos: porTipo.map((p) => ({
      tipo: String(pick(p, "passengerTypeCode") ?? ""),
      quantidade: num(pick(p, "count")) ?? 1,
      total: num(pick(p, "totalByType")) ?? 0,
    })),
    parcelas: arr(pick(resumoPedido, "installments")).map((o) => ({
      installment: num(pick(o, "installment")) ?? 1,
      installmentsValue: num(pick(o, "installmentsValue")) ?? 0,
      total: num(pick(o, "total")) ?? 0,
      interestRate: num(pick(o, "interestRate")) ?? 0,
      hasRate: Boolean(pick(o, "hasRate")),
    })),
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
  /** Datas do voo: o fornecedor valida a idade contra elas. */
  firstJourneyDate?: string;
  lastJourneyDate?: string | null;
};

/** Data do primeiro/último voo do carrinho, no formato aceito pelo fornecedor. */
function datasDaViagem(body: unknown): { primeira?: string; ultima?: string } {
  const journeys = (body as { data?: { flight?: { journeys?: unknown[] } } })?.data?.flight?.journeys;
  if (!Array.isArray(journeys) || journeys.length === 0) return {};
  const iso = (j: unknown, campo: "departure" | "destination") => {
    const p = (j as Record<string, { date?: { year?: number; month?: number; day?: number }; time?: { hour?: number; minute?: number } }>)[campo];
    const d = p?.date;
    if (!d?.year || !d.month || !d.day) return undefined;
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.year}-${pad(d.month)}-${pad(d.day)}T${pad(p?.time?.hour ?? 0)}:${pad(p?.time?.minute ?? 0)}:00`;
  };
  return {
    primeira: iso(journeys[0], "departure"),
    ultima: iso(journeys[journeys.length - 1], "destination"),
  };
}

/** Envia os passageiros já preenchidos no portal VIA AIR. */
export async function enviarPassageiros(
  cartId: string,
  passageiros: PassageiroOner[],
  token: string,
  integrationOrderId?: string,
) {
  // O fornecedor recusa o passageiro ("adulto deve ter mais de 12 anos")
  // quando as datas do voo não vão junto, então buscamos no carrinho.
  const carrinho = await onerFetch(`${ONER_API}/api/checkout/v1/booking/${cartId}`, { token });
  const { primeira, ultima } = datasDaViagem(carrinho.body);
  const body = {
    cartId,
    passengers: passageiros.map((p) => ({
      ...p,
      dateOfBirth: normalizarNascimento(p.dateOfBirth),
      firstJourneyDate: p.firstJourneyDate ?? primeira ?? null,
      lastJourneyDate: p.lastJourneyDate ?? ultima ?? null,
    })),
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
