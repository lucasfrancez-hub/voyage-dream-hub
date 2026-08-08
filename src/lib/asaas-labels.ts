/**
 * Rótulos em português para os tipos de movimentação do ASAAS.
 *
 * Regra do projeto: nada de texto em inglês na UI. Quando o ASAAS enviar um
 * tipo novo que ainda não está no dicionário abaixo, o fallback traduz
 * palavra a palavra — assim nunca aparece algo como
 * "Pix transaction debit refund" na tela.
 */

export const ASAAS_TYPE_LABELS: Record<string, string> = {
  PAYMENT_RECEIVED: "Pagamento recebido",
  PAYMENT_CONFIRMED: "Pagamento confirmado",
  PAYMENT_CREATED: "Cobrança criada",
  PAYMENT_REFUNDED: "Pagamento estornado",
  PAYMENT_REFUND_CANCELLED: "Estorno cancelado",
  PAYMENT_FEE: "Taxa da cobrança",
  PAYMENT_REVERSAL: "Estorno de pagamento",
  PAYMENT_DUNNING_RECEIVED: "Recuperação de cobrança",
  PIX_FEE: "Taxa do Pix",
  PIX_TRANSACTION_CREDIT: "Pix recebido",
  PIX_TRANSACTION_DEBIT: "Pix enviado",
  PIX_TRANSACTION_DEBIT_REFUND: "Estorno de Pix enviado",
  PIX_TRANSACTION_CREDIT_REFUND: "Estorno de Pix recebido",
  PIX_TRANSACTION_DEBIT_FEE: "Taxa de Pix enviado",
  TRANSFER: "Transferência Pix",
  TRANSFER_FEE: "Taxa de transferência",
  TRANSFER_CANCELLED: "Transferência cancelada",
  TRANSFER_REVERSAL: "Estorno de transferência",
  INTERNAL_TRANSFER_CREDIT: "Transferência recebida",
  INTERNAL_TRANSFER_DEBIT: "Transferência enviada",
  INTERNAL_TRANSFER_REVERSAL: "Estorno de transferência interna",
  INSTANT_TEXT_MESSAGE_FEE: "Taxa de mensagem (WhatsApp)",
  PHONE_CALL_NOTIFICATION_FEE: "Taxa de ligação",
  POSTAL_SERVICE_FEE: "Taxa de correio",
  BILL_PAYMENT: "Pagamento de boleto",
  BILL_PAYMENT_FEE: "Taxa de pagamento de conta",
  BILL_PAYMENT_CANCELLED: "Pagamento de conta cancelado",
  BILL_PAYMENT_REFUNDED: "Pagamento de conta estornado",
  ASAAS_CARD_TRANSACTION: "Compra no cartão",
  ASAAS_CARD_TRANSACTION_FEE: "Taxa de compra no cartão",
  ASAAS_CARD_TRANSACTION_PARTIAL_REFUND_CANCELLATION: "Estorno parcial no cartão",
  ASAAS_CARD_BILL_PAYMENT: "Fatura do cartão ASAAS",
  ASAAS_CARD_RECHARGE: "Recarga do cartão ASAAS",
  ASAAS_CARD_CASHBACK: "Cashback do cartão ASAAS",
  CREDIT_CARD_FEE: "Taxa de cartão",
  RECEIVABLE_ANTICIPATION: "Antecipação de recebíveis",
  RECEIVABLE_ANTICIPATION_FEE: "Taxa de antecipação",
  DEBIT: "Débito",
  CREDIT: "Crédito",
  REFUND: "Reembolso",
  REVERSAL: "Estorno",
  CHARGEBACK: "Chargeback",
  CHARGEBACK_REVERSAL: "Estorno de chargeback",
  FEE: "Taxa",
  BALANCE_MIGRATION: "Migração de saldo",
  CONTRACTUAL_EFFECT_SETTLEMENT: "Liquidação de efeito contratual",
};

/** Tradução palavra a palavra usada quando o tipo é desconhecido. */
const WORDS: Record<string, string> = {
  PIX: "Pix",
  TRANSACTION: "transação",
  TRANSACTIONS: "transações",
  DEBIT: "débito",
  CREDIT: "crédito",
  REFUND: "estorno",
  REFUNDED: "estornado",
  REVERSAL: "estorno",
  FEE: "taxa",
  FEES: "taxas",
  TRANSFER: "transferência",
  INTERNAL: "interna",
  PAYMENT: "pagamento",
  PAYMENTS: "pagamentos",
  RECEIVED: "recebido",
  CONFIRMED: "confirmado",
  CREATED: "criado",
  CANCELLED: "cancelado",
  CANCELED: "cancelado",
  BILL: "conta",
  CARD: "cartão",
  ASAAS: "ASAAS",
  BALANCE: "saldo",
  MIGRATION: "migração",
  ANTICIPATION: "antecipação",
  RECEIVABLE: "recebível",
  CHARGEBACK: "chargeback",
  MESSAGE: "mensagem",
  TEXT: "texto",
  INSTANT: "instantânea",
  PHONE: "telefone",
  CALL: "ligação",
  NOTIFICATION: "notificação",
  POSTAL: "correio",
  SERVICE: "serviço",
  PARTIAL: "parcial",
  CANCELLATION: "cancelamento",
  RECHARGE: "recarga",
  CASHBACK: "cashback",
  SETTLEMENT: "liquidação",
  CONTRACTUAL: "contratual",
  EFFECT: "efeito",
  DUNNING: "recuperação",
};

export function asaasTypeLabel(type: string | null | undefined): string {
  if (!type) return "Movimentação";
  const key = String(type).toUpperCase();
  const known = ASAAS_TYPE_LABELS[key];
  if (known) return known;

  const translated = key
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((w) => WORDS[w] ?? w.toLowerCase())
    .join(" ");

  return translated.replace(/^./, (c) => c.toUpperCase());
}
