/**
 * Importação de reserva da Comprar Viagem a partir do link de checkout.
 *
 * A Sky Hub envia somente o link (ou o identificador do carrinho). A VIA AIR
 * resolve o cartId, usa a sessão autenticada já existente (renovando quando
 * necessário, pelo fluxo atual — nada aqui altera autenticação), consulta o
 * carrinho no fornecedor e devolve um payload normalizado.
 *
 * Nunca devolve token, código de acesso, e-mail monitorado, código do agente,
 * institutionId ou qualquer dado de autenticação do fornecedor.
 * SERVER-ONLY.
 */
import { arr, num, pick } from "@/lib/integrations/oner/client.server";

export type SegmentoImportado = {
  journey: "outbound" | "inbound" | string;
  origin: string | null;
  originCity: string | null;
  originAirport: string | null;
  destination: string | null;
  destinationCity: string | null;
  destinationAirport: string | null;
  departureDateTime: string | null;
  arrivalDateTime: string | null;
  airline: string | null;
  airlineIata: string | null;
  flightNumber: string | null;
  cabin: string | null;
  fareFamily: string | null;
  connections: string[];
  baggage: { carryOn: string | null; checked: string | null };
};

export type PassageiroImportado = {
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  type: string | null;
  documentType: string | null;
  documentNumber: string | null;
  birthDate: string | null;
};

export type ReservaImportada = {
  provider: "comprar_viagem";
  externalCartId: string;
  externalReservationId: string;
  sourceUrl: string | null;
  locator: string | null;
  status: string;
  expired: boolean;
  currency: string;
  segments: SegmentoImportado[];
  passengers: PassageiroImportado[];
  passengersSaved: boolean;
  amount: { fare: number | null; taxes: number | null; total: number | null };
  installments: Array<{
    installment: number;
    installmentsValue: number;
    total: number;
    interestRate: number;
    hasRate: boolean;
  }>;
  fetchedAt: string;
};

const UUID = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;

/** Extrai o identificador do carrinho do link público (ou do próprio id). */
export function extrairCartIdDeEntrada(entrada: unknown): string | null {
  const m = String(entrada ?? "").match(UUID);
  return m ? m[0]!.toLowerCase() : null;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

function isoDoPonto(p: unknown): string | null {
  const d = (pick(p, "date") ?? {}) as { year?: number; month?: number; day?: number };
  const t = (pick(p, "time") ?? {}) as { hour?: number; minute?: number };
  if (!d?.year || !d.month || !d.day) return null;
  return `${d.year}-${pad2(d.month)}-${pad2(d.day)}T${pad2(t?.hour ?? 0)}:${pad2(t?.minute ?? 0)}:00`;
}

function textoBagagem(b: Record<string, unknown> | undefined): string | null {
  if (!b) return null;
  const qtd = num(pick(b, "quantity")) ?? 1;
  const peso = num(pick(b, "weight"));
  return peso ? `${qtd} peça(s) de até ${peso}kg` : `${qtd} peça(s)`;
}

function tipoDocumento(id: unknown): string | null {
  const n = num(id);
  if (n === 1) return "CPF";
  if (n === 2) return "PASSPORT";
  if (n == null) return null;
  return `TYPE_${n}`;
}

function soDigitos(v: unknown): string | null {
  const d = String(v ?? "").replace(/\D/g, "");
  return d.length >= 5 ? d : null;
}

function dataNascimento(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** Converte a resposta crua do carrinho no contrato entregue à Sky Hub. */
export function normalizarReserva(
  body: unknown,
  args: { cartId: string; sourceUrl: string | null },
): ReservaImportada {
  const d = (pick(body, "data") ?? body ?? {}) as Record<string, unknown>;
  const flight = (pick(d, "flight") ?? {}) as Record<string, unknown>;
  const price = (pick(flight, "price") ?? {}) as Record<string, unknown>;
  const resumoPedido = (pick(d, "orderSummary") ?? {}) as Record<string, unknown>;

  const jornadas = arr(pick(flight, "journeys"));
  const segments: SegmentoImportado[] = [];

  jornadas.forEach((j, indice) => {
    const rotulo =
      jornadas.length === 2 ? (indice === 0 ? "outbound" : "inbound") : indice === 0 ? "outbound" : `leg_${indice + 1}`;
    const bagagens = arr(pick(j, "baggagesAllowance"));
    const mao = bagagens.find((b) => Number(pick(b, "type")) === 1);
    const despachada = bagagens.find((b) => Number(pick(b, "type")) !== 1);
    const trechos = arr(pick(j, "segments", "flightSegments", "legs"));
    const conexoes = trechos
      .slice(0, -1)
      .map((s) => String(pick(s, "destination.city", "arrival.city", "destination.iata") ?? "").trim())
      .filter(Boolean);

    for (const s of trechos) {
      const saida = pick(s, "departure");
      const chegada = pick(s, "destination", "arrival");
      segments.push({
        journey: rotulo,
        origin: (pick(saida, "iata") as string | undefined) ?? null,
        originCity: (pick(saida, "city") as string | undefined) ?? null,
        originAirport: (pick(saida, "name") as string | undefined) ?? null,
        destination: (pick(chegada, "iata") as string | undefined) ?? null,
        destinationCity: (pick(chegada, "city") as string | undefined) ?? null,
        destinationAirport: (pick(chegada, "name") as string | undefined) ?? null,
        departureDateTime: isoDoPonto(saida),
        arrivalDateTime: isoDoPonto(chegada),
        airline: (pick(s, "marketingAirline.name", "airline.name") as string | undefined) ?? null,
        airlineIata: (pick(s, "marketingAirline.iata", "airline.iata") as string | undefined) ?? null,
        flightNumber: (pick(s, "flightNumber", "number") as string | undefined)?.toString() ?? null,
        cabin: (pick(s, "cabin.name", "cabinClass.name", "fareClass.cabin") as string | undefined) ?? null,
        fareFamily:
          (pick(s, "fareClass.airlineFareFamily", "airlineFareFamily") as string | undefined) ?? null,
        connections: conexoes,
        baggage: { carryOn: textoBagagem(mao), checked: textoBagagem(despachada) },
      });
    }
  });

  const passageirosCrus = arr(pick(flight, "passengers"));
  const passengers: PassageiroImportado[] = passageirosCrus.map((p) => {
    const firstName = (pick(p, "firstName", "name") as string | undefined)?.trim() ?? null;
    const lastName = (pick(p, "lastName", "surname") as string | undefined)?.trim() ?? null;
    return {
      fullName: [firstName, lastName].filter(Boolean).join(" ").trim() || null,
      firstName,
      lastName,
      type: (pick(p, "passengerTypeCode", "typeCode", "type") as string | undefined) ?? null,
      documentType: tipoDocumento(pick(p, "documentTypeId", "documentType")),
      documentNumber: soDigitos(pick(p, "documentNumber", "document")),
      birthDate: dataNascimento(pick(p, "dateOfBirth", "birthDate")),
    };
  });

  const expired = Boolean(pick(d, "cartExpired", "expired") ?? false);
  const locator =
    (pick(d, "locator", "recordLocator", "pnr") as string | undefined) ??
    (pick(flight, "locator", "recordLocator") as string | undefined) ??
    null;
  const statusFornecedor = (pick(d, "status", "statusName") as string | undefined) ?? null;

  return {
    provider: "comprar_viagem",
    externalCartId: args.cartId,
    externalReservationId: args.cartId,
    sourceUrl: args.sourceUrl,
    locator: locator ? String(locator).toUpperCase() : null,
    status: statusFornecedor ?? (expired ? "EXPIRED" : "CART_ACTIVE"),
    expired,
    currency: (pick(d, "currency", "currencyCode") as string | undefined) ?? "BRL",
    segments,
    passengers,
    passengersSaved: passengers.length > 0 && passengers.every((p) => Boolean(p.fullName)),
    amount: {
      fare: num(pick(price, "price")),
      taxes: num(pick(price, "tax")),
      total:
        num(pick(resumoPedido, "totalWithDiscount")) ??
        num(pick(price, "totalPrice", "total", "totalAmount")) ??
        num(pick(d, "totalPrice")),
    },
    installments: arr(pick(resumoPedido, "installments")).map((o) => ({
      installment: num(pick(o, "installment")) ?? 1,
      installmentsValue: num(pick(o, "installmentsValue")) ?? 0,
      total: num(pick(o, "total")) ?? 0,
      interestRate: num(pick(o, "interestRate")) ?? 0,
      hasRate: Boolean(pick(o, "hasRate")),
    })),
    fetchedAt: new Date().toISOString(),
  };
}

/** Registro de auditoria da tentativa (sem token, sem código, sem e-mail). */
export async function registrarImportacao(args: {
  cartId: string | null;
  sourceUrl: string | null;
  correlationId: string;
  sucesso: boolean;
  detalhe: string;
  status?: number | null;
}) {
  try {
    const { registrarEvento } = await import("@/lib/integrations/oner/store.server");
    await registrarEvento({
      eventType: args.sucesso ? "import_reservation_ok" : "import_reservation_failed",
      message: `Importação Comprar Viagem (${args.cartId ?? "sem cartId"}): ${args.detalhe}`,
      payload: {
        provider: "comprar_viagem",
        cartId: args.cartId,
        sourceUrl: args.sourceUrl,
        correlationId: args.correlationId,
        providerStatus: args.status ?? null,
        at: new Date().toISOString(),
      },
    });
  } catch {
    /* auditoria nunca derruba a importação */
  }
}
