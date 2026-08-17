/**
 * Conector de homologação do checkout Owner (OnerTravel / Comprar Viagem).
 * SERVER-ONLY. Usado apenas pela tela interna "Teste Checkout Owner".
 *
 * Não guarda token em disco nem em variável global: o JWT vive só no ciclo
 * da execução do teste (o front devolve o token em cada chamada seguinte).
 */

const AUTH_API = "https://api.auth.onertravel.com";
const API = "https://api.onertravel.com";
export const INSTITUTION_ID = "23";
export const AGENT_ID = 83956;
export const CHECKOUT_BASE = "https://checkout.comprarviagem.com.br/checkout";

export type OwnerCall = {
  endpoint: string;
  method: string;
  status: number;
  ok: boolean;
  message?: string | null;
};

function baseHeaders(token?: string | null): Record<string, string> {
  return {
    "content-type": "application/json",
    accept: "application/json, text/plain, */*",
    authorization: token ? `Bearer ${token}` : "Bearer",
    institutionid: INSTITUTION_ID,
    agentid: String(AGENT_ID),
    applicationname: "COMPRARVIAGEM",
    applicationaccesstype: "1",
    platform: "WEBAPP",
    language: "4",
    currencie: "1",
    currency: "1",
    ispackage: "false",
    referer: "https://www.comprarviagem.com.br/",
    origin: "https://www.comprarviagem.com.br",
  };
}

async function call<T = unknown>(
  url: string,
  init: { method: string; body?: unknown; token?: string | null },
): Promise<{ call: OwnerCall; body: T | null; raw: string }> {
  let status = 0;
  let raw = "";
  try {
    const res = await fetch(url, {
      method: init.method,
      headers: baseHeaders(init.token),
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(45_000),
    });
    status = res.status;
    raw = await res.text();
    let body: T | null = null;
    try {
      body = raw ? (JSON.parse(raw) as T) : null;
    } catch {
      body = null;
    }
    const msg =
      (body as { message?: string; errorMessage?: string } | null)?.message ??
      (body as { errorMessage?: string } | null)?.errorMessage ??
      (res.ok ? null : raw.slice(0, 300));
    return {
      call: { endpoint: url, method: init.method, status, ok: res.ok, message: msg ?? null },
      body,
      raw,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      call: { endpoint: url, method: init.method, status, ok: false, message },
      body: null,
      raw,
    };
  }
}

/** Extrai o GUID do cartId a partir de uma URL ou do próprio GUID colado. */
export function extrairCartId(entrada: string): string | null {
  const m = String(entrada ?? "").match(
    /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/,
  );
  return m ? m[0].toLowerCase() : null;
}

/** Normaliza a data de nascimento para o formato ISO completo exigido pela Owner:
 *  "1998-04-09" -> "1998-04-09T00:00:00.000Z".
 *  Se já vier com horário, preserva o valor original.
 */
export function ownerNormalizeDateOfBirth(dateOfBirth: string): string {
  const d = String(dateOfBirth ?? "").trim();
  if (d.includes("T")) return d;
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return `${d}T00:00:00.000Z`;
  return d;
}

/** Data/hora atual com offset (ex.: 2026-08-17T01:20:33-03:00). */
export function dateTimeClient(now = new Date()): string {
  const off = -now.getTimezoneOffset();
  const sinal = off >= 0 ? "+" : "-";
  const abs = Math.abs(off);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}` +
    `T${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}${sinal}${hh}:${mm}`
  );
}

export async function ownerSendCode(email: string) {
  const r = await call<{ success?: boolean; message?: string }>(
    `${AUTH_API}/api/authenticate/send-code`,
    { method: "POST", body: { email, userCreationModeManual: false } },
  );
  const success = Boolean(r.body?.success) && r.call.ok;
  return { success, call: r.call };
}

export async function ownerValidateCode(email: string, code: string) {
  const r = await call<{ success?: boolean; data?: { token?: string }; message?: string }>(
    `${AUTH_API}/api/authenticate/code`,
    {
      method: "POST",
      body: {
        email,
        authenticationCode: code,
        agentId: AGENT_ID,
        dateTimeClient: dateTimeClient(),
      },
    },
  );
  const token = r.body?.data?.token ?? null;
  return { success: Boolean(token) && r.call.ok, token, call: r.call };
}

export type CarrinhoResumo = {
  cartId: string | null;
  cartExpired: boolean | null;
  cartType: string | null;
  origem: string | null;
  destino: string | null;
  ida: string | null;
  volta: string | null;
  adultos: number | null;
  criancas: number | null;
  bebes: number | null;
  total: number | null;
  moeda: string | null;
  parcelas: string | null;
  voos: Array<{ trecho: string; data: string; cia: string; voo: string }>;
  /** Prontidão para seguir no checkout. */
  pronto: boolean;
  faltando: string[];
};

function pick(obj: unknown, ...caminhos: string[]): unknown {
  for (const c of caminhos) {
    let cur: unknown = obj;
    for (const k of c.split(".")) {
      if (cur && typeof cur === "object" && k in (cur as Record<string, unknown>)) {
        cur = (cur as Record<string, unknown>)[k];
      } else {
        cur = undefined;
        break;
      }
    }
    if (cur !== undefined && cur !== null) return cur;
  }
  return undefined;
}

function arr(v: unknown): Array<Record<string, unknown>> {
  return Array.isArray(v) ? (v as Array<Record<string, unknown>>) : [];
}

const num = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[^\d.,-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/** Resumo do carrinho Owner (data.flight / data.orderSummary). */
export function resumirCarrinho(payload: unknown): CarrinhoResumo {
  const d = (pick(payload, "data") ?? payload) as Record<string, unknown>;
  const flight = (pick(d, "flight") ?? {}) as Record<string, unknown>;
  const orderSummary = (pick(d, "orderSummary") ?? {}) as Record<string, unknown>;

  const journeys = arr(
    pick(flight, "journeys") ?? pick(d, "journeys", "itineraries", "flight.itineraries"),
  );

  const voos: CarrinhoResumo["voos"] = [];
  const datasPorJornada: string[] = [];
  const pontas: Array<{ de: string; para: string }> = [];

  for (const j of journeys) {
    const segmentos = arr(pick(j, "segments", "flightSegments", "legs"));
    let primeiroDe = "";
    let ultimoPara = "";
    let primeiraData = "";
    for (const s of segmentos) {
      const de = String(
        pick(
          s,
          "departureAirport.iata",
          "departureAirport.code",
          "departure.iata",
          "departureIata",
          "origin.iata",
          "origin",
          "from",
        ) ?? "?",
      );
      const para = String(
        pick(
          s,
          "arrivalAirport.iata",
          "arrivalAirport.code",
          "arrival.iata",
          "arrivalIata",
          "destination.iata",
          "destination",
          "to",
        ) ?? "?",
      );
      const data = String(
        pick(s, "departureDate", "departureDateTime", "departure.date", "departureAt") ?? "",
      );
      if (!primeiroDe) primeiroDe = de;
      if (!primeiraData) primeiraData = data;
      ultimoPara = para;
      voos.push({
        trecho: `${de} → ${para}`,
        data,
        cia: String(
          pick(s, "airline.name", "airlineName", "marketingAirline.name", "marketingAirline", "airline") ??
            "",
        ),
        voo: String(pick(s, "flightNumber", "number", "flight") ?? ""),
      });
    }
    if (!segmentos.length) {
      primeiroDe = String(pick(j, "departureAirport.iata", "origin", "from") ?? "");
      ultimoPara = String(pick(j, "arrivalAirport.iata", "destination", "to") ?? "");
      primeiraData = String(pick(j, "departureDate", "departureDateTime") ?? "");
      if (primeiroDe || ultimoPara) {
        voos.push({ trecho: `${primeiroDe || "?"} → ${ultimoPara || "?"}`, data: primeiraData, cia: "", voo: "" });
      }
    }
    datasPorJornada.push(primeiraData);
    pontas.push({ de: primeiroDe, para: ultimoPara });
  }

  // Passageiros: contagem por tipo (flight.passengers / orderSummary.passengers / quantidades)
  const paxLista = arr(
    pick(flight, "passengers") ?? pick(orderSummary, "passengers") ?? pick(d, "passengers"),
  );
  const contaTipo = (codigos: string[]) =>
    paxLista.filter((p) => {
      const t = String(
        pick(p, "passengerTypeCode", "typeCode", "type", "passengerType") ?? "",
      ).toUpperCase();
      return codigos.includes(t);
    }).length;

  const adultos =
    (paxLista.length ? contaTipo(["ADT", "ADULT", "1"]) : null) ??
    num(pick(flight, "adults") ?? pick(d, "adults", "passengersQuantity.adults"));
  const criancas =
    (paxLista.length ? contaTipo(["CHD", "CNN", "CHILD", "2"]) : null) ??
    num(pick(flight, "children") ?? pick(d, "children", "passengersQuantity.children"));
  const bebes =
    (paxLista.length ? contaTipo(["INF", "INFANT", "3"]) : null) ??
    num(pick(flight, "infants") ?? pick(d, "infants", "passengersQuantity.infants"));

  const price = (pick(flight, "price") ?? pick(d, "price") ?? {}) as Record<string, unknown>;
  const total =
    num(pick(price, "totalPrice", "total", "totalAmount", "amount")) ??
    num(pick(orderSummary, "totalPrice", "total", "totalAmount"));

  const installments = arr(pick(orderSummary, "installments") ?? pick(d, "installments"));
  let parcelas: string | null = null;
  if (installments.length) {
    const melhor =
      installments
        .map((i) => ({
          n: num(pick(i, "installmentNumber", "quantity", "number", "installments")) ?? 0,
          v: num(pick(i, "installmentValue", "value", "amount", "installmentAmount")),
          juros: Boolean(pick(i, "hasInterest", "interest")),
        }))
        .filter((i) => i.n > 0)
        .sort((a, b) => b.n - a.n)[0] ?? null;
    parcelas = melhor
      ? `até ${melhor.n}x${melhor.v ? ` de ${melhor.v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` : ""}${melhor.juros ? " (com juros)" : " sem juros"}`
      : `${installments.length} opções`;
  }

  const cartExpired = (pick(d, "cartExpired", "expired") as boolean | undefined) ?? null;

  const faltando: string[] = [];
  if (cartExpired === true) faltando.push("carrinho expirado");
  if (!journeys.length) faltando.push("trechos (journeys)");
  if (!(total && total > 0)) faltando.push("preço total");
  if (!installments.length) faltando.push("parcelamento");

  return {
    cartId: (pick(d, "cartId", "id") as string) ?? null,
    cartExpired,
    cartType: (pick(d, "cartType", "type") as string) ?? null,
    origem: pontas[0]?.de || null,
    destino: pontas[0]?.para || null,
    ida: datasPorJornada[0] || null,
    volta: datasPorJornada.length > 1 ? (datasPorJornada[datasPorJornada.length - 1] || null) : null,
    adultos,
    criancas,
    bebes,
    total,
    moeda:
      (pick(price, "currency", "currencyCode") as string) ??
      (pick(d, "currency", "currencyCode") as string) ??
      "BRL",
    parcelas,
    voos,
    pronto: faltando.length === 0,
    faltando,
  };
}

export async function ownerGetCart(cartId: string, token: string) {
  const r = await call<unknown>(`${API}/api/checkout/v1/booking/${cartId}`, {
    method: "GET",
    token,
  });
  const resumo = r.body ? resumirCarrinho(r.body) : null;
  const paxOk = (() => {
    const d = (pick(r.body, "data") ?? r.body) as Record<string, unknown> | null;
    const lista = arr(pick(d ?? {}, "flight.passengers", "passengers", "orderSummary.passengers"));
    return lista.length > 0 && lista.every((p) => Boolean(pick(p, "firstName", "name")));
  })();
  return {
    call: r.call,
    payloadJson: r.raw ? r.raw.slice(0, 20_000) : "",
    resumo,
    /** Carrinho consolidado (trechos + preço + parcelamento, não expirado). */
    carrinhoPronto: Boolean(resumo?.pronto),
    /** Passageiros já persistidos na Owner — usado após o PUT. */
    passageirosPersistidos: paxOk,
    checkoutPronto: Boolean(resumo?.pronto) && paxOk,
  };
}


export type PassageiroOwner = {
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

export async function ownerSavePassengers(
  cartId: string,
  passengers: PassageiroOwner[],
  token: string,
) {
  const body = {
    cartId,
    passengers: passengers.map((p) => ({
      ...p,
      dateOfBirth: ownerNormalizeDateOfBirth(p.dateOfBirth),
    })),
  };
  const r = await call<{ success?: boolean; message?: string }>(
    `${API}/api/booking/flight/passenger/${cartId}`,
    { method: "PUT", body, token },
  );
  return {
    success: Boolean(r.body?.success) && r.call.ok,
    call: r.call,
    payloadEnviado: JSON.stringify(body, null, 2),
    respostaJson: r.raw.slice(0, 5_000),
  };
}

export function checkoutUrl(cartId: string): string {
  return `${CHECKOUT_BASE}/${cartId}?institutionId=${INSTITUTION_ID}`;
}
