/**
 * Tarifação e reserva PassHub. SERVER-ONLY.
 *
 * Contrato observado no painel da agência:
 *  - POST {nexus}/api/v1/tarifar  → revalida preço e devolve pricedRateToken(s)
 *  - POST {nexus}/api/v1/reservar → cria a reserva e devolve o localizador
 */
import { passhubBases, passhubRequest } from "./client.server";
import { calcularIncentivo, passhubIncentivoPct } from "./incentivo.server";
import type { PassHubPax, PassHubReserva, PassHubTarifacao } from "./types";

type Rec = Record<string, unknown>;

/** E-mail oficial de contato usado em todas as reservas da consolidadora. */
const EMAIL_CONTATO = "lucas@voeair.com";

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
  /** Roteiro internacional muda o pct de incentivo do nível. */
  internacional?: boolean;
};

export async function passhubTarifarOferta(input: TarifarInput): Promise<PassHubTarifacao> {
  // A PassHub repete o token combinado nos dois trechos de algumas ofertas.
  // Enviar esse mesmo token duas vezes pode duplicar a viagem na reserva.
  const tokens = [...new Set(input.rateTokens.filter(Boolean))];
  if (tokens.length === 0) throw new Error("Oferta sem rateToken — refaça a busca.");

  const { provedorDoToken, PROVEDORES_CONHECIDOS } = await import("./provider-registry.server");

  // Ordem de tentativa: o que a tela mandou, o que a busca registrou para o
  // token e, por fim, os fornecedores conhecidos. Enviar o provider errado é a
  // causa mais comum do erro genérico da PassHub na tarifação.
  const candidatos = [
    (input.provedor || "").toUpperCase(),
    (provedorDoToken(tokens[0] ?? "") || "").toUpperCase(),
    ...PROVEDORES_CONHECIDOS,
  ].filter((p, i, arrp) => p && arrp.indexOf(p) === i);

  const montaCorpo = (provider: string): Rec => {
    const body: Rec = { preco: input.precoEsperado || 0, provider };
    if (input.ravPercentual != null) body["rav_percentage"] = input.ravPercentual;
    if (tokens.length > 2) {
      body["rateTokens"] = tokens;
    } else {
      body["rateToken"] = tokens[0];
      if (tokens[1]) body["rateTokenVolta"] = tokens[1];
    }
    return body;
  };

  let bruto: unknown;
  let ultimoErro: unknown;
  let providerUsado = candidatos[0] ?? "CVC";
  for (const provider of candidatos) {
    try {
      bruto = await passhubRequest<unknown>(`${passhubBases.nexus}/api/v1/tarifar`, {
        body: montaCorpo(provider),
        headers: correlationId(),
        // A companhia oscila: repetimos sozinhos antes de mostrar erro na tela.
        retentativas: 2,
      });
      providerUsado = provider;
      ultimoErro = undefined;
      break;
    } catch (e) {
      ultimoErro = e;
      const detalhe = (e as { detalhe?: unknown } | null)?.detalhe;
      const texto = (typeof detalhe === "string" ? detalhe : JSON.stringify(detalhe ?? "")).toLowerCase();
      // Só vale tentar outro fornecedor quando o erro é de token/provider.
      const trocarProvedor = /provider|rate token|deserialization|rav_invalido/.test(texto);
      if (!trocarProvedor) throw e;
      console.warn(`[passhub] tarifar recusou provider=${provider}; tentando o próximo`);
    }
  }
  if (ultimoErro) throw ultimoErro;

  const r = rec(bruto);

  const pricedTokens = lista(r["pricedRateTokens"]);
  const pricedToken = str(r["pricedRateToken"]);
  const pricedVolta = str(r["pricedRateTokenVolta"]);

  // O mesmo fornecedor precisa ir na reserva; guardamos junto do token tarifado.
  {
    const { registraProvedor } = await import("./provider-registry.server");
    for (const t of [...pricedTokens, pricedToken, pricedVolta]) registraProvedor(t, providerUsado);
  }


  const preco = num(r["preco"] ?? r["total_price"] ?? r["priceWithTax"], input.precoEsperado);
  const precoSemTaxa = num(r["preco_sem_taxa"] ?? r["priceWithoutTax"]);

  // RAV efetiva do % enviado. Alguns retornos já trazem a comissão fechada.
  const rav = Math.max(
    num(r["rav_amount_brl_efetivo"] ?? r["rav_amount_brl"] ?? r["rav_amount"]),
    num(
      r["valor_comissao"] ??
        r["comissao"] ??
        r["commission_amount_brl"] ??
        r["commission_amount"],
    ),
  );

  // Incentivo do nível de recompensas: não vem na tarifação, é calculado pelo
  // próprio portal como tarifa base x pct do nível — e existe mesmo com RAV 0%.
  const incentivoPct = await passhubIncentivoPct(input.internacional === true);
  const incentivoValor = calcularIncentivo(precoSemTaxa || preco, incentivoPct);

  return {
    pricedRateTokens: pricedTokens.length
      ? pricedTokens
      : [pricedToken, pricedVolta].filter(Boolean),
    preco,
    precoSemTaxa,
    // Comissão total exibida = RAV + incentivo (mesma conta do portal).
    ravValor: Math.round((rav + incentivoValor) * 100) / 100,
    ravSemIncentivo: rav,
    incentivoValor,
    incentivoPercentual: incentivoPct,
    ravModo: str(r["rav_mode"]),
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
  // Defesa adicional para nunca reservar duas vezes o mesmo token tarifado.
  const tokens = [...new Set(input.pricedRateTokens.filter(Boolean))];
  if (tokens.length === 0) throw new Error("Tarifação expirada — tarifar novamente antes de reservar.");
  if (input.paxs.length === 0) throw new Error("Informe ao menos um passageiro.");

  /** Todas as reservas da consolidadora usam sempre o e-mail oficial da agência. */


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
      email: EMAIL_CONTATO,
      phone: (p.telefone ?? "").replace(/\D/g, ""),
      ddi: (p.ddi ?? "55").replace(/\D/g, ""),
      ddd: (p.ddd ?? "").replace(/\D/g, ""),
    })),
    provider: (input.provedor || "CVC").toUpperCase(),
  };

  /** Contato da reserva: a PassHub também espera o bloco no nível raiz. */
  const contato = input.paxs[0];
  if (contato) {
    body["email"] = EMAIL_CONTATO;
    body["ddi"] = (contato.ddi ?? "55").replace(/\D/g, "");
    body["ddd"] = (contato.ddd ?? "").replace(/\D/g, "");
    body["phone"] = (contato.telefone ?? "").replace(/\D/g, "");
    body["contact"] = {
      email: EMAIL_CONTATO,
      ddi: (contato.ddi ?? "55").replace(/\D/g, ""),
      ddd: (contato.ddd ?? "").replace(/\D/g, ""),
      phone: (contato.telefone ?? "").replace(/\D/g, ""),
    };
  }

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

  const localizador = str(r["localizador"] ?? r["locator"] ?? r["bookingId"]);

  // Guardamos os dados completos dos passageiros: a consolidadora só devolve o
  // nome depois, e o detalhe da reserva precisa de CPF/nascimento.
  if (localizador) {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("passhub_reserva_pax").insert(
        input.paxs.map((p, i) => ({
          localizador,
          ordem: i,
          nome: p.nome.trim().toUpperCase(),
          sobrenome: p.sobrenome.trim().toUpperCase(),
          documento_tipo: p.documentoTipo,
          documento:
            p.documentoTipo === "passport"
              ? p.documento.trim().toUpperCase()
              : p.documento.replace(/\D/g, ""),
          nascimento: p.nascimento || null,
          genero: p.genero ?? null,
          tipo: p.tipo ?? null,
          telefone: `${p.ddd ?? ""}${p.telefone ?? ""}`.replace(/\D/g, "") || null,
        })),
      );
    } catch (e) {
      console.error("[passhub] não gravou passageiros locais:", e);
    }
  }

  return {
    localizador,
    localizadorCompanhia: str(r["localizador_companhia"]) || localizador,
    bookingId: str(r["bookingId"] ?? r["booking_id"] ?? r["bookingIdProvider"]),
    bookingToken: str(r["booking_token"]),
    status: str(r["status"] ?? r["booking_status"]),
    total: num(r["total_price"]),
    totalSemTaxa: num(r["preco_sem_taxa"]),
  };
}

