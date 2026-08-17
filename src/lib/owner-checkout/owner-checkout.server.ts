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

/** Resumo tolerante do carrinho — a API varia campos entre tipos de produto. */
export function resumirCarrinho(payload: unknown): CarrinhoResumo {
  const d = (pick(payload, "data") ?? payload) as Record<string, unknown>;
  const itinerarios =
    (pick(d, "itineraries", "flight.itineraries", "flights", "cartItems") as
      | Array<Record<string, unknown>>
      | undefined) ?? [];

  const voos: CarrinhoResumo["voos"] = [];
  for (const it of itinerarios) {
    const segmentos =
      (pick(it, "segments", "flightSegments", "legs") as Array<Record<string, unknown>> | undefined) ??
      [];
    for (const s of segmentos) {
      voos.push({
        trecho: `${String(pick(s, "departureAirport.iata", "departure.iata", "departureIata", "origin") ?? "?")} → ${String(
          pick(s, "arrivalAirport.iata", "arrival.iata", "arrivalIata", "destination") ?? "?",
        )}`,
        data: String(pick(s, "departureDate", "departureDateTime", "departure.date") ?? ""),
        cia: String(pick(s, "airline.name", "airlineName", "marketingAirline", "airline") ?? ""),
        voo: String(pick(s, "flightNumber", "number", "flight") ?? ""),
      });
    }
  }

  const num = (v: unknown) => (typeof v === "number" ? v : v == null ? null : Number(v) || null);

  return {
    cartId: (pick(d, "cartId", "id") as string) ?? null,
    cartExpired: (pick(d, "cartExpired", "expired") as boolean) ?? null,
    cartType: (pick(d, "cartType", "type") as string) ?? null,
    origem: voos[0]?.trecho.split(" → ")[0] ?? null,
    destino: voos[0]?.trecho.split(" → ")[1] ?? null,
    ida: voos[0]?.data ?? null,
    volta: voos.length > 1 ? (voos[voos.length - 1]?.data ?? null) : null,
    adultos: num(pick(d, "adults", "passengersQuantity.adults", "paxAdults")),
    criancas: num(pick(d, "children", "passengersQuantity.children", "paxChildren")),
    bebes: num(pick(d, "infants", "passengersQuantity.infants", "paxInfants")),
    total: num(pick(d, "totalPrice", "price.total", "total", "amount")),
    moeda: (pick(d, "currency", "currencyCode", "price.currency") as string) ?? null,
    parcelas:
      (pick(d, "installmentsDescription", "installments.description") as string) ??
      (num(pick(d, "installments", "maxInstallments")) !== null
        ? `até ${num(pick(d, "installments", "maxInstallments"))}x`
        : null),
    voos,
  };
}

export async function ownerGetCart(cartId: string, token: string) {
  const r = await call<unknown>(`${API}/api/checkout/v1/booking/${cartId}`, {
    method: "GET",
    token,
  });
  return {
    call: r.call,
    payloadJson: r.raw ? r.raw.slice(0, 20_000) : "",
    resumo: r.body ? resumirCarrinho(r.body) : null,
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
  const body = { cartId, passengers };
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
