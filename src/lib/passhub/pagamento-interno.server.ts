/**
 * Pagamento interno das reservas da consolidadora (PassHub). SERVER-ONLY.
 *
 * Dois cenários:
 *
 * 1) Cobrança do cliente com RAV por fora (`cobranca_cliente`)
 *    Geramos um Pix NOSSO (ASAAS) no valor da PassHub + RAV por fora. Quando o
 *    ASAAS avisa que o Pix caiu, o sistema paga automaticamente o Pix copia e
 *    cola da PassHub com o saldo da nossa conta.
 *
 * 2) Pagar agora (`pagamento_direto`)
 *    Pegamos o Pix copia e cola da PassHub e pagamos na hora, debitando do
 *    saldo ASAAS. Nada é cobrado do cliente por aqui.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  createAsaasPixPayment,
  decodeAsaasPixBrCode,
  ensureAsaasCustomer,
  getAsaasBalance,
  payAsaasPixBrCode,
} from "@/lib/asaas.server";
import { passhubPixDoLink } from "./pix.server";
import { passhubLinkPagamentoReserva } from "./reservas.server";

export type PagamentoReserva = {
  id: string;
  idPassagem: number;
  localizador: string | null;
  modo: string;
  valorPasshub: number;
  markup: number;
  valorCobrado: number;
  clienteNome: string | null;
  pixCopiaCola: string | null;
  pixQrBase64: string | null;
  pixExpiraEm: string | null;
  status: string;
  recebidoEm: string | null;
  repasseStatus: string | null;
  repasseValor: number | null;
  repasseEm: string | null;
  repasseErro: string | null;
  criadoEm: string;
};

const dinheiro = (v: unknown) => Number(Number(v ?? 0).toFixed(2));

function mapear(row: Record<string, any>): PagamentoReserva {
  return {
    id: row["id"],
    idPassagem: Number(row["id_passagem"]),
    localizador: row["localizador"] ?? null,
    modo: row["modo"],
    valorPasshub: Number(row["valor_passhub"] ?? 0),
    markup: Number(row["markup"] ?? 0),
    valorCobrado: Number(row["valor_cobrado"] ?? 0),
    clienteNome: row["cliente_nome"] ?? null,
    pixCopiaCola: row["pix_copia_cola"] ?? null,
    pixQrBase64: row["pix_qr_base64"] ?? null,
    pixExpiraEm: row["pix_expira_em"] ?? null,
    status: row["status"],
    recebidoEm: row["recebido_em"] ?? null,
    repasseStatus: row["repasse_status"] ?? null,
    repasseValor: row["repasse_valor"] == null ? null : Number(row["repasse_valor"]),
    repasseEm: row["repasse_em"] ?? null,
    repasseErro: row["repasse_erro"] ?? null,
    criadoEm: row["created_at"],
  };
}

/** Pix atual da PassHub para a reserva (sempre gerado na hora, para não expirar). */
async function pixDaPassHub(alvo: { id?: number; localizador?: string; link?: string }) {
  let link = (alvo.link ?? "").trim();
  if (!link) {
    const r = await passhubLinkPagamentoReserva({ id: alvo.id, localizador: alvo.localizador });
    link = r.link;
  }
  if (!link) throw new Error("A consolidadora ainda não gerou o link de pagamento desta reserva.");
  const pix = await passhubPixDoLink(link);
  if (!pix.copiaECola) throw new Error("A consolidadora não devolveu o Pix desta reserva.");
  return { link, pix };
}

/* ------------------------------------------------------------------ *
 * 1) Cobrança do cliente com RAV por fora
 * ------------------------------------------------------------------ */

export type CriarCobrancaInput = {
  idPassagem: number;
  localizador?: string | null;
  link?: string | null;
  /** RAV por fora, em reais. Interno: não vai para a consolidadora. */
  markup: number;
  /** Quando informado, sobrepõe o valor lido da PassHub (ajuste manual). */
  valorCobradoManual?: number | null;
  clienteNome?: string | null;
  clienteDocumento?: string | null;
  clienteEmail?: string | null;
  clienteTelefone?: string | null;
  /** Minutos de validade do nosso QR. */
  expiraEmMinutos?: number | null;
  /** Pagar a PassHub automaticamente assim que o Pix cair. */
  autoRepasse?: boolean;
  criadoPor?: string | null;
};

export async function criarCobrancaComRav(input: CriarCobrancaInput): Promise<PagamentoReserva> {
  const { link, pix } = await pixDaPassHub({
    id: input.idPassagem,
    localizador: input.localizador ?? undefined,
    link: input.link ?? undefined,
  });

  const valorPasshub = dinheiro(pix.valor);
  const markup = dinheiro(input.markup);
  const valorCobrado = dinheiro(
    input.valorCobradoManual && input.valorCobradoManual > 0
      ? input.valorCobradoManual
      : valorPasshub + markup,
  );
  if (valorCobrado <= 0) throw new Error("Valor da cobrança inválido.");
  if (valorPasshub > 0 && valorCobrado < valorPasshub) {
    throw new Error(
      `A cobrança (${valorCobrado}) não pode ser menor que o valor da consolidadora (${valorPasshub}).`,
    );
  }

  const customerId = await ensureAsaasCustomer({
    name: input.clienteNome || `Reserva ${input.localizador || input.idPassagem}`,
    cpfCnpj: input.clienteDocumento ?? null,
    email: input.clienteEmail ?? null,
    phone: input.clienteTelefone ?? null,
    externalReference: `passhub-${input.idPassagem}`,
  });

  const cobranca = await createAsaasPixPayment({
    customerId,
    value: valorCobrado,
    description: `Reserva aérea ${input.localizador || input.idPassagem} — VIA AIR`,
    externalReference: `passhub-reserva-${input.idPassagem}`,
    expiresInMinutes: input.expiraEmMinutos ?? 60 * 24,
  });

  const { data, error } = await supabaseAdmin
    .from("passhub_pagamentos")
    .insert({
      id_passagem: input.idPassagem,
      localizador: input.localizador ?? null,
      modo: "cobranca_cliente",
      valor_passhub: valorPasshub,
      markup: dinheiro(valorCobrado - valorPasshub),
      valor_cobrado: valorCobrado,
      cliente_nome: input.clienteNome ?? null,
      cliente_documento: input.clienteDocumento ?? null,
      cliente_email: input.clienteEmail ?? null,
      cliente_telefone: input.clienteTelefone ?? null,
      asaas_payment_id: cobranca.paymentId,
      pix_copia_cola: cobranca.payload,
      pix_qr_base64: cobranca.encodedImage
        ? cobranca.encodedImage.startsWith("data:")
          ? cobranca.encodedImage
          : `data:image/png;base64,${cobranca.encodedImage}`
        : null,
      pix_expira_em: cobranca.expiresAt,
      passhub_brcode: pix.copiaECola,
      passhub_link: link,
      status: "aguardando",
      auto_repasse: input.autoRepasse !== false,
      criado_por: input.criadoPor ?? null,
    })
    .select("*")
    .single();

  if (error) throw new Error(`Falha ao registrar a cobrança: ${error.message}`);
  return mapear(data as Record<string, any>);
}

/* ------------------------------------------------------------------ *
 * 2) Pagamento da PassHub com saldo ASAAS
 * ------------------------------------------------------------------ */

async function pagarBrCode(opts: {
  brcode: string;
  valor: number;
  referencia: string;
  descricao: string;
  criadoPor?: string | null;
  /** Valor que o operador viu na tela de conferência. */
  valorEsperado?: number | null;
}) {
  const info = await decodeAsaasPixBrCode(opts.brcode).catch(() => null);
  if (info && info.canBePaid === false) {
    throw new Error("Este Pix da consolidadora não pode mais ser pago (expirado ou já quitado).");
  }
  // O valor decodificado do próprio BR Code é a única fonte de verdade.
  const valor = dinheiro(info?.value ?? opts.valor);
  if (!valor || valor <= 0) throw new Error("Não foi possível determinar o valor do Pix da consolidadora.");

  const esperado = dinheiro(opts.valorEsperado ?? 0);
  if (esperado > 0 && Math.abs(esperado - valor) > 0.01) {
    throw new Error(
      `O Pix da consolidadora mudou de valor (conferido R$ ${esperado.toFixed(2)}, agora R$ ${valor.toFixed(2)}). Nada foi pago — confira de novo.`,
    );
  }

  const saldo = await getAsaasBalance().catch(() => 0);
  if (saldo > 0 && saldo < valor) {
    throw new Error(
      `Saldo ASAAS insuficiente: disponível R$ ${saldo.toFixed(2)}, necessário R$ ${valor.toFixed(2)}.`,
    );
  }

  // O ASAAS exige `value` mesmo em QR com valor fixo ("Informe o valor a ser
  // transferido"); enviamos sempre o valor decodificado (ou o informado).
  // A conta ASAAS usa autorização externa para toda saída. O webhook só
  // aprova transferências que já existam em `asaas_transfers`, portanto o
  // registro precisa ser criado ANTES da chamada /pix/qrCodes/pay. Usamos o
  // UUID local como externalReference para o webhook correlacionar a saída.
  const tentativa = crypto.randomUUID();
  const { data: registro, error: registroErro } = await supabaseAdmin
    .from("asaas_transfers")
    .insert({
      status: "pendente",
      idempotency_key: `${opts.referencia}-${tentativa}`,
      favored_name: info?.receiverName || "Consolidadora",
      pix_key: `brcode:${tentativa}`,
      pix_key_type: "QR_CODE",
      cpf_cnpj: info?.receiverDocument ?? null,
      bank_name: info?.bankName ?? null,
      value: valor,
      description: opts.descricao,
      origin: "outro",
      created_by: opts.criadoPor ?? null,
    })
    .select("id")
    .single();
  if (registroErro || !registro?.id) {
    throw new Error(`Não foi possível preparar a autorização do Pix: ${registroErro?.message ?? "registro ausente"}`);
  }

  let transfer: any;
  try {
    transfer = await payAsaasPixBrCode({
      payload: opts.brcode,
      value: valor,
      description: opts.descricao,
      externalReference: registro.id,
    });
    const bruto = String(transfer?.status ?? "PENDING").toUpperCase();
    const status = bruto === "DONE"
      ? "concluido"
      : bruto === "FAILED"
        ? "falhou"
        : bruto === "CANCELLED" || bruto === "CANCELED"
          ? "cancelado"
          : bruto === "BANK_PROCESSING" || bruto === "IN_BANK_PROCESSING"
            ? "processando"
            : "pendente";
    await supabaseAdmin
      .from("asaas_transfers")
      .update({
        asaas_transfer_id: transfer?.id ?? null,
        status,
        asaas_status: bruto,
        effective_date: transfer?.effectiveDate ?? null,
        receipt_url: transfer?.transactionReceiptUrl ?? null,
        raw_response: transfer ?? null,
      })
      .eq("id", registro.id);
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "Falha ao pagar Pix";
    await supabaseAdmin
      .from("asaas_transfers")
      .update({ status: "falhou", fail_reason: mensagem })
      .eq("id", registro.id);
    throw error;
  }

  return {
    transferId: String(transfer?.id ?? ""),
    status: String(transfer?.status ?? "PENDING"),
    valor,
    recebedor: info?.receiverName ?? null,
  };
}

/** Traduz o status bruto do ASAAS para o status do pagamento da reserva. */
export function statusRepasse(bruto: string | null | undefined): {
  status: "repassado" | "falha_repasse" | "repassando";
  erro: string | null;
} {
  const s = String(bruto ?? "").toUpperCase();
  if (s === "DONE") return { status: "repassado", erro: null };
  if (s === "FAILED" || s === "CANCELLED" || s === "CANCELED" || s === "REFUSED" || s === "REFUNDED") {
    return {
      status: "falha_repasse",
      erro:
        s === "REFUNDED"
          ? "O Pix foi estornado pela consolidadora."
          : "O ASAAS recusou/cancelou a transferência (autorização externa recusada).",
    };
  }
  return { status: "repassando", erro: null };
}

/* ------------------------------------------------------------------ *
 * 2.a) Conferência antes de pagar (tela de revisão)
 * ------------------------------------------------------------------ */

export type PreviaPixConsolidadora = {
  link: string;
  brcode: string;
  qrCodeBase64: string;
  expiraEm: string;
  /** Valor informado pelo checkout da consolidadora. */
  valorCheckout: number;
  /** Valor lido do próprio BR Code (o que será debitado). */
  valor: number;
  recebedorNome: string | null;
  recebedorDocumento: string | null;
  banco: string | null;
  podePagar: boolean;
  divergencia: boolean;
  saldo: number | null;
};

/** Gera o Pix da consolidadora e decodifica para conferência antes do pagamento. */
export async function previaPixConsolidadora(alvo: {
  idPassagem: number;
  localizador?: string | null;
  link?: string | null;
}): Promise<PreviaPixConsolidadora> {
  const { link, pix } = await pixDaPassHub({
    id: alvo.idPassagem,
    localizador: alvo.localizador ?? undefined,
    link: alvo.link ?? undefined,
  });

  const info = await decodeAsaasPixBrCode(pix.copiaECola).catch(() => null);
  const saldo = await getAsaasBalance().catch(() => null);
  const valorCheckout = dinheiro(pix.valor);
  const valor = dinheiro(info?.value ?? valorCheckout);

  return {
    link,
    brcode: pix.copiaECola,
    qrCodeBase64: pix.qrCodeBase64,
    expiraEm: pix.expiraEm,
    valorCheckout,
    valor,
    recebedorNome: info?.receiverName ?? null,
    recebedorDocumento: info?.receiverDocument ?? null,
    banco: info?.bankName ?? null,
    podePagar: info ? info.canBePaid !== false : true,
    divergencia: valorCheckout > 0 && Math.abs(valorCheckout - valor) > 0.01,
    saldo,
  };
}

/** Botão "Pagar agora": paga o Pix da PassHub direto do saldo ASAAS. */
export async function pagarReservaAgora(alvo: {
  idPassagem: number;
  localizador?: string | null;
  link?: string | null;
  criadoPor?: string | null;
  /** BR Code já conferido na tela de revisão (evita gerar outro Pix). */
  brcode?: string | null;
  /** Valor conferido na tela de revisão. */
  valorEsperado?: number | null;
}): Promise<PagamentoReserva> {
  let link = alvo.link ?? null;
  let brcode = (alvo.brcode ?? "").trim();
  let valorPix = dinheiro(alvo.valorEsperado ?? 0);

  if (!brcode) {
    const gerado = await pixDaPassHub({
      id: alvo.idPassagem,
      localizador: alvo.localizador ?? undefined,
      link: alvo.link ?? undefined,
    });
    link = gerado.link;
    brcode = gerado.pix.copiaECola;
    valorPix = dinheiro(gerado.pix.valor);
  }

  const pago = await pagarBrCode({
    brcode,
    valor: valorPix,
    valorEsperado: alvo.valorEsperado ?? null,
    referencia: `passhub-pagamento-${alvo.idPassagem}`,
    descricao: `Pagamento reserva ${alvo.localizador || alvo.idPassagem} — consolidadora`,
    criadoPor: alvo.criadoPor ?? null,
  });

  const resultado = statusRepasse(pago.status);

  const { data, error } = await supabaseAdmin
    .from("passhub_pagamentos")
    .insert({
      id_passagem: alvo.idPassagem,
      localizador: alvo.localizador ?? null,
      modo: "pagamento_direto",
      valor_passhub: pago.valor,
      markup: 0,
      valor_cobrado: 0,
      passhub_brcode: brcode,

      passhub_link: link,
      status: resultado.status,
      repasse_transfer_id: pago.transferId,
      repasse_status: pago.status,
      repasse_valor: pago.valor,
      repasse_erro: resultado.erro,
      repasse_em: resultado.status === "repassado" ? new Date().toISOString() : null,
      auto_repasse: false,
      criado_por: alvo.criadoPor ?? null,
    })
    .select("*")
    .single();

  if (error) throw new Error(`Pix enviado, mas falhou o registro: ${error.message}`);
  if (resultado.status === "falha_repasse") {
    throw Object.assign(new Error(resultado.erro ?? "Falha no pagamento à consolidadora."), {
      pagamento: mapear(data as Record<string, any>),
    });
  }
  return mapear(data as Record<string, any>);
}

/** Repassa (paga a PassHub) o valor de uma cobrança já recebida. */
export async function repassarPagamento(id: string): Promise<PagamentoReserva> {
  const { data: row } = await supabaseAdmin
    .from("passhub_pagamentos")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!row) throw new Error("Pagamento não encontrado.");
  if (row.status === "repassado") return mapear(row as Record<string, any>);

  try {
    // Regenera o Pix da consolidadora: o BR Code anterior pode ter expirado.
    const { pix } = await pixDaPassHub({
      id: Number(row.id_passagem),
      localizador: row.localizador ?? undefined,
      link: row.passhub_link ?? undefined,
    });

    const pago = await pagarBrCode({
      brcode: pix.copiaECola,
      valor: dinheiro(pix.valor || row.valor_passhub),
      referencia: `passhub-repasse-${row.id}`,
      descricao: `Repasse reserva ${row.localizador || row.id_passagem} — consolidadora`,
      criadoPor: row.criado_por ?? null,
    });

    const resultado = statusRepasse(pago.status);
    const { data } = await supabaseAdmin
      .from("passhub_pagamentos")
      .update({
        status: resultado.status,
        passhub_brcode: pix.copiaECola,
        repasse_transfer_id: pago.transferId,
        repasse_status: pago.status,
        repasse_valor: pago.valor,
        repasse_em: resultado.status === "repassado" ? new Date().toISOString() : null,
        repasse_erro: resultado.erro,
      })
      .eq("id", row.id)
      .select("*")
      .single();
    if (resultado.status === "falha_repasse") {
      throw Object.assign(new Error(resultado.erro ?? "Falha no repasse."), {
        pagamento: data ? mapear(data) : null,
      });
    }
    return mapear((data ?? row) as Record<string, any>);
  } catch (e) {
    const erro = e instanceof Error ? e.message : "Falha ao repassar";
    const { data } = await supabaseAdmin
      .from("passhub_pagamentos")
      .update({ status: "falha_repasse", repasse_erro: erro })
      .eq("id", row.id)
      .select("*")
      .single();
    throw Object.assign(new Error(erro), { pagamento: data ? mapear(data) : null });
  }
}

/* ------------------------------------------------------------------ *
 * Rastreamento: webhook do ASAAS
 * ------------------------------------------------------------------ */

/**
 * Trata eventos do ASAAS ligados a cobranças de reservas da consolidadora.
 * Quando o Pix do cliente cai, dispara o pagamento automático da PassHub.
 */
export async function processarWebhookPagamentoReserva(body: any): Promise<{ handled: boolean; info?: string }> {
  const evento: string = body?.event ?? "";
  const paymentId: string | undefined = body?.payment?.id;
  if (!paymentId) return { handled: false };

  const { data: row } = await supabaseAdmin
    .from("passhub_pagamentos")
    .select("*")
    .eq("asaas_payment_id", paymentId)
    .maybeSingle();
  if (!row) return { handled: false };

  const pagos = ["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"];
  const cancelados = ["PAYMENT_DELETED", "PAYMENT_REFUNDED", "PAYMENT_CHARGEBACK_REQUESTED"];

  if (cancelados.includes(evento)) {
    await supabaseAdmin
      .from("passhub_pagamentos")
      .update({ status: evento === "PAYMENT_REFUNDED" ? "estornado" : "cancelado" })
      .eq("id", row.id);
    return { handled: true, info: "cancelado" };
  }

  if (!pagos.includes(evento)) return { handled: true, info: `evento ignorado (${evento})` };
  if (row.status === "repassado") return { handled: true, info: "já repassado" };

  await supabaseAdmin
    .from("passhub_pagamentos")
    .update({
      status: "recebido",
      recebido_em: body?.payment?.paymentDate
        ? new Date(body.payment.paymentDate).toISOString()
        : new Date().toISOString(),
    })
    .eq("id", row.id);

  if (row.auto_repasse === false) return { handled: true, info: "recebido (repasse manual)" };

  try {
    await repassarPagamento(row.id);
    return { handled: true, info: "recebido e repassado" };
  } catch (e) {
    console.error("[passhub-pagamento] repasse automático falhou:", (e as Error).message);
    return { handled: true, info: `recebido, repasse falhou: ${(e as Error).message}` };
  }
}

/**
 * Reconfere no ASAAS o status real das transferências ainda em andamento e
 * grava falhas/recusas no pagamento. Chamado pelo botão "Atualizar".
 */
async function sincronizarRepasses(rows: Record<string, any>[]) {
  const pendentes = rows.filter(
    (r) => r.repasse_transfer_id && ["repassando", "repassado"].includes(String(r.status)),
  );
  for (const r of pendentes) {
    try {
      const t: any = await getAsaasTransfer(String(r.repasse_transfer_id));
      const bruto = String(t?.status ?? "").toUpperCase();
      if (!bruto || bruto === String(r.repasse_status ?? "").toUpperCase()) continue;
      const resultado = statusRepasse(bruto);
      const patch: Record<string, any> = {
        status: resultado.status,
        repasse_status: bruto,
        repasse_erro: resultado.erro ?? t?.failReason ?? null,
        repasse_em: resultado.status === "repassado" ? r.repasse_em ?? new Date().toISOString() : null,
      };
      await supabaseAdmin.from("passhub_pagamentos").update(patch).eq("id", r.id);
      Object.assign(r, patch);
      if (r.repasse_transfer_id) {
        await supabaseAdmin
          .from("asaas_transfers")
          .update({ asaas_status: bruto, fail_reason: t?.failReason ?? null })
          .eq("asaas_transfer_id", String(r.repasse_transfer_id));
      }
    } catch (e) {
      console.error("[passhub-pagamento] sync transferência falhou:", (e as Error).message);
    }
  }
}

/** Pagamentos registrados de uma reserva (com status do repasse atualizado). */
export async function listarPagamentosReserva(idPassagem: number): Promise<PagamentoReserva[]> {
  const { data } = await supabaseAdmin
    .from("passhub_pagamentos")
    .select("*")
    .eq("id_passagem", idPassagem)
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as Record<string, any>[];
  await sincronizarRepasses(rows);
  return rows.map((r) => mapear(r));
}
