/**
 * Pagamento com cartão no checkout PassHub. SERVER-ONLY.
 *
 * Fluxo oficial do checkout (descoberto no bundle público da consolidadora):
 *   1. O cartão é digitado em campos hospedados (Datatrans SecureFields) no
 *      navegador — número e CVV nunca passam pelo nosso servidor.
 *   2. O SecureFields devolve um `transaction_id` (cartão tokenizado).
 *   3. Com ele consultamos as opções de parcelamento e criamos a sessão 3DS.
 *   4. Se o banco exigir autenticação (auth_status = ACTION_REQUIRED), o
 *      desafio 3DS é exibido no navegador (Evervault/Rinne) e, ao concluir,
 *      chamamos /cartao/emitir.
 */

const CHECKOUT_API = "https://checkout-api.passhub.com.br/api/v1";
const NEXUS_API = "https://nexus.passhub.com.br/api/v1";

export type CheckoutSessao = {
  jwt: string;
  bookingToken: string;
  agenciaId: number | null;
};

/** Troca o código curto do link pelo acesso temporário do checkout. */
export async function abrirSessaoCheckout(shortCode: string): Promise<CheckoutSessao> {
  const resp = await fetch(`${NEXUS_API}/expand-booking-token/${shortCode}`, {
    headers: { Accept: "application/json", Origin: "https://checkout.passhub.com.br" },
  });
  if (!resp.ok) {
    throw new Error(
      resp.status === 404
        ? "Link de pagamento expirado ou não encontrado na consolidadora."
        : `Falha ao abrir o checkout (HTTP ${resp.status}).`,
    );
  }
  const body = (await resp.json()) as {
    temp_jwt?: string;
    booking_token?: string;
    agency_id?: number;
  };
  if (!body.temp_jwt || !body.booking_token) {
    throw new Error("A consolidadora não devolveu o acesso ao checkout.");
  }
  return { jwt: body.temp_jwt, bookingToken: body.booking_token, agenciaId: body.agency_id ?? null };
}

async function postCheckout(
  sessao: CheckoutSessao,
  caminho: string,
  corpo: Record<string, unknown>,
  deviceId: string,
  rotulo: string,
): Promise<Record<string, unknown>> {
  const resp = await fetch(`${CHECKOUT_API}${caminho}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${sessao.jwt}`,
      "X-Device-Id": deviceId,
      Origin: "https://checkout.passhub.com.br",
    },
    body: JSON.stringify(corpo),
  });
  const texto = await resp.text();
  let json: Record<string, unknown> = {};
  try {
    json = texto ? (JSON.parse(texto) as Record<string, unknown>) : {};
  } catch {
    /* resposta não-JSON */
  }
  if (!resp.ok) {
    const det = json["detail"];
    const msg =
      typeof det === "string"
        ? det
        : Array.isArray(det)
          ? det.map((d) => (d as { msg?: string })?.msg).filter(Boolean).join("; ")
          : "";
    throw new Error(
      msg ? `${rotulo}: ${msg}` : `${rotulo} recusado pela consolidadora (HTTP ${resp.status}).`,
    );
  }
  return json;
}

export type ParcelaOpcao = {
  parcelas: number;
  valorParcela: number;
  total: number;
  rotulo: string;
};

const num = (v: unknown, fb = 0): number => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : fb;
};

/** Opções de parcelamento para o cartão já tokenizado (transaction_id). */
export async function passhubCartaoParcelas(
  shortCode: string,
  transactionId: string,
  deviceId: string,
): Promise<{ parcelas: ParcelaOpcao[]; valorOriginal: number | null }> {
  const sessao = await abrirSessaoCheckout(shortCode);
  const json = await postCheckout(
    sessao,
    "/cartao/formas-financiamento",
    { booking_token: sessao.bookingToken, transaction_id: transactionId },
    deviceId,
    "Consulta de parcelamento",
  );

  const dados = (
    json["data"] && typeof json["data"] === "object" ? json["data"] : json
  ) as Record<string, unknown>;

  // Formatos possíveis: lista de opções em data/options/installments/financiamentos
  const listaRaw =
    (Array.isArray(dados["options"]) && dados["options"]) ||
    (Array.isArray(dados["installments"]) && dados["installments"]) ||
    (Array.isArray(dados["financiamentos"]) && dados["financiamentos"]) ||
    (Array.isArray(dados["data"]) && dados["data"]) ||
    (Array.isArray(json) && json) ||
    [];

  const brl = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

  const parcelas: ParcelaOpcao[] = [];
  for (const item of listaRaw as Record<string, unknown>[]) {
    if (!item || typeof item !== "object") continue;
    const n = num(item["installments"] ?? item["parcelas"] ?? item["quantity"], 0);
    if (!n) continue;
    let total = num(
      item["total"] ?? item["total_amount"] ?? item["valor_total"] ?? item["amount"],
      0,
    );
    let valorParcela = num(
      item["installment_value"] ?? item["valor_parcela"] ?? item["value"] ?? item["parcela"],
      0,
    );
    // alguns formatos vêm em centavos
    if (total > 100000 && !valorParcela) { total = total / 100; }
    if (!valorParcela && total) valorParcela = total / n;
    if (!total && valorParcela) total = valorParcela * n;
    if (valorParcela > total * 2 && total) valorParcela = valorParcela / 100;
    const juros = num(item["interest"] ?? item["juros"] ?? item["taxa"], NaN);
    parcelas.push({
      parcelas: n,
      valorParcela,
      total,
      rotulo:
        n === 1
          ? `À vista — ${brl(total || valorParcela)}`
          : `${n}x de ${brl(valorParcela)}${Number.isFinite(juros) && juros > 0 ? "" : " sem juros"} — total ${brl(total || valorParcela * n)}`,
    });
  }
  parcelas.sort((a, b) => a.parcelas - b.parcelas);

  return { parcelas, valorOriginal: num(dados["amount"] ?? dados["valor"], 0) || null };
}

export type DadosTitular = {
  transactionId: string;
  nome: string;
  validadeMes: string;
  validadeAno: string;
  cpfTitular?: string;
  emailTitular?: string;
  parcelas: number;
};

function corpoCartao(sessao: CheckoutSessao, d: DadosTitular) {
  const ano = d.validadeAno.length === 2 ? `20${d.validadeAno}` : d.validadeAno;
  const email = (d.emailTitular || "").trim() || undefined;
  return {
    booking_token: sessao.bookingToken,
    transaction_id: d.transactionId,
    card_name: d.nome,
    expiration_month: d.validadeMes.padStart(2, "0"),
    expiration_year: ano,
    card_holder_cpf: (d.cpfTitular || "").replace(/\D/g, "") || undefined,
    email,
    card_holder_email: email,
    installments: d.parcelas,
    operator_code: null,
    save_card: false,
  };
}

export type Resultado3ds =
  | { acao: "desafio"; tdsSessionId: string; merchantId: string; ambiente: string }
  | { acao: "direto" }
  | { acao: "bloqueado"; motivo: string };

/** Cria a sessão 3DS — pode exigir desafio do banco ou liberar direto. */
export async function passhubCartaoSessao3ds(
  shortCode: string,
  d: DadosTitular,
  deviceId: string,
): Promise<Resultado3ds> {
  const sessao = await abrirSessaoCheckout(shortCode);
  const json = await postCheckout(
    sessao,
    "/cartao/3ds-session",
    corpoCartao(sessao, d),
    deviceId,
    "Autenticação do banco",
  );
  const dados = (
    json["data"] && typeof json["data"] === "object" ? json["data"] : json
  ) as Record<string, unknown>;

  const status = String(dados["auth_status"] ?? dados["status"] ?? "").toUpperCase();
  if (status === "ACTION_REQUIRED") {
    const tds = String(dados["tds_session_id"] ?? "");
    const merchant = String(dados["merchant_id"] ?? "");
    if (!tds || !merchant) {
      throw new Error("Não foi possível iniciar a autenticação do banco.");
    }
    return {
      acao: "desafio",
      tdsSessionId: tds,
      merchantId: merchant,
      ambiente: String(dados["rinne_environment"] ?? "production"),
    };
  }
  if (status === "FAILED" || status === "BLOCKED") {
    return {
      acao: "bloqueado",
      motivo: "O banco bloqueou a autenticação deste cartão. Tente outro cartão.",
    };
  }
  return { acao: "direto" };
}

export type ResultadoEmissao = {
  sucesso: boolean;
  status: string;
  localizador: string | null;
  mensagem: string | null;
};

/** Emite o pagamento no cartão (chamar após o 3DS quando houver desafio). */
export async function passhubCartaoEmitir(
  shortCode: string,
  d: DadosTitular,
  deviceId: string,
): Promise<ResultadoEmissao> {
  const sessao = await abrirSessaoCheckout(shortCode);
  const json = await postCheckout(
    sessao,
    "/cartao/emitir",
    corpoCartao(sessao, d),
    deviceId,
    "Pagamento",
  );
  const dados = (
    json["data"] && typeof json["data"] === "object" ? json["data"] : json
  ) as Record<string, unknown>;
  const status = String(dados["status"] ?? dados["payment_status"] ?? "").toUpperCase();
  const falhou = ["FAILED", "DECLINED", "CANCELLED", "ERROR", "RECUSADO"].includes(status);
  return {
    sucesso: !falhou,
    status: status || "OK",
    localizador:
      (dados["localizador"] as string) ??
      (dados["booking_locator"] as string) ??
      (dados["locator"] as string) ??
      null,
    mensagem: (dados["message"] as string) ?? (dados["mensagem"] as string) ?? null,
  };
}
