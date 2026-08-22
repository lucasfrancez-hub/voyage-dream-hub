/**
 * Tarifação e reserva PassHub. SERVER-ONLY.
 *
 * Contrato observado no painel da agência:
 *  - POST {nexus}/api/v1/tarifar  → revalida preço e devolve pricedRateToken(s)
 *  - POST {nexus}/api/v1/reservar → cria a reserva e devolve o localizador
 */
import { passhubBases, passhubRequest } from "./client.server";
import type { PassHubPax, PassHubReserva, PassHubTarifacao } from "./types";

type Rec = Record<string, unknown>;

const rec = (v: unknown): Rec => (v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : {});
const str = (v: unknown, fb = ""): string => (typeof v === "string" ? v : v == null ? fb : String(v));
const num = (v: unknown, fb = 0): number => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : fb;
};
const lista = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => str(x)).filter(Boolean) : []);

function correlationId() {
  return { "X-Correlation-Id": crypto.randomUUID() };
}

/* -------------------------------- tarifar -------------------------------- */

export type TarifarInput = {
  /** Tokens na ordem dos trechos (1 = só ida, 2 = ida e volta, 3+ = multitrecho). */
  rateTokens: string[];
  provedor: string;
  /** Preço total esperado (mesma unidade da busca). */
  precoEsperado: number;
  ravPercentual?: number | null;
};

export async function passhubTarifarOferta(input: TarifarInput): Promise<PassHubTarifacao> {
  const tokens = input.rateTokens.filter(Boolean);
  if (tokens.length === 0) throw new Error("Oferta sem rateToken — refaça a busca.");

  const body: Rec = {
    preco: input.precoEsperado || 0,
    provider: (input.provedor || "CVC").toUpperCase(),
  };
  if (input.ravPercentual != null) body["rav_percentage"] = input.ravPercentual;

  if (tokens.length > 2) {
    body["rateTokens"] = tokens;
  } else {
    body["rateToken"] = tokens[0];
    if (tokens[1]) body["rateTokenVolta"] = tokens[1];
  }

  const bruto = await passhubRequest<unknown>(`${passhubBases.nexus}/api/v1/tarifar`, {
    body,
    headers: correlationId(),
  });
  const r = rec(bruto);

  const pricedTokens = lista(r["pricedRateTokens"]);
  const pricedToken = str(r["pricedRateToken"]);
  const pricedVolta = str(r["pricedRateTokenVolta"]);

  return {
    pricedRateTokens: pricedTokens.length
      ? pricedTokens
      : [pricedToken, pricedVolta].filter(Boolean),
    preco: num(r["preco"] ?? r["total_price"], input.precoEsperado),
    precoSemTaxa: num(r["preco_sem_taxa"]),
    retarifou: r["retarifou"] === true,
  };
}

/* -------------------------------- reservar -------------------------------- */

export type ReservarInput = {
  pricedRateTokens: string[];
  paxs: PassHubPax[];
  provedor: string;
  ravPercentual?: number | null;
};

export async function passhubReservarOferta(input: ReservarInput): Promise<PassHubReserva> {
  const tokens = input.pricedRateTokens.filter(Boolean);
  if (tokens.length === 0) throw new Error("Tarifação expirada — tarifar novamente antes de reservar.");
  if (input.paxs.length === 0) throw new Error("Informe ao menos um passageiro.");

  const body: Rec = {
    paxs: input.paxs.map((p) => ({
      firstName: p.nome.trim().toUpperCase(),
      lastName: p.sobrenome.trim().toUpperCase(),
      birthDate: p.nascimento,
      gender: p.genero,
      document:
        p.documentoTipo === "passport"
          ? {
              type: "passport",
              doc: p.documento.trim().toUpperCase(),
              issuingCountry: p.paisEmissor || "BR",
              residenceCountry: p.paisResidencia || "BR",
              issuingDate: p.emissao ?? "",
              expirationDate: p.validade ?? "",
            }
          : {
              type: "cpf",
              doc: p.documento.replace(/\D/g, ""),
              issuingCountry: "BR",
            },
      passengerType: p.tipo,
      email: p.email ?? "",
      phone: (p.telefone ?? "").replace(/\D/g, ""),
      ddi: (p.ddi ?? "55").replace(/\D/g, ""),
      ddd: (p.ddd ?? "").replace(/\D/g, ""),
    })),
    provider: (input.provedor || "CVC").toUpperCase(),
  };
  if (input.ravPercentual != null) body["rav_percentage"] = input.ravPercentual;

  if (tokens.length > 2) {
    body["pricedRateTokens"] = tokens;
    body["is_multitrecho"] = true;
  } else {
    body["pricedRateToken"] = tokens[0];
    if (tokens[1]) body["pricedRateTokenVolta"] = tokens[1];
  }

  const bruto = await passhubRequest<unknown>(`${passhubBases.nexus}/api/v1/reservar`, {
    body,
    headers: correlationId(),
  });
  const r = rec(bruto);

  return {
    localizador: str(r["localizador"] ?? r["locator"] ?? r["bookingId"]),
    localizadorCompanhia: str(r["localizador_companhia"]),
    bookingId: str(r["bookingId"] ?? r["booking_id"] ?? r["bookingIdProvider"]),
    bookingToken: str(r["booking_token"]),
    status: str(r["status"] ?? r["booking_status"]),
    total: num(r["total_price"]),
    totalSemTaxa: num(r["preco_sem_taxa"]),
  };
}
