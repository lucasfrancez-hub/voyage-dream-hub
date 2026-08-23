/**
 * Condições de pagamento definidas MANUALMENTE pelo consultor, por opção
 * do orçamento.
 *
 * Regra: quando `enabled` é true, o que o consultor digitou substitui o
 * cálculo automático daquela opção (cartão, boleto e Pix). Nada é inventado:
 * se um campo ficar em branco, o valor automático continua valendo.
 */
import type { Installment, PaymentConfiguration } from "./types";

export type OptionPaymentOverride = {
  enabled: boolean;
  card: {
    enabled: boolean;
    /** quantidade de parcelas oferecidas */
    installments: number | null;
    /** valor de cada parcela (quando informado, manda no valor exibido) */
    amount: number | null;
    interestFree: boolean;
  };
  boleto: {
    enabled: boolean;
    entrada: number | null;
    installments: number | null;
    amount: number | null;
    /** data limite de pagamento/quitação (YYYY-MM-DD) */
    dueDate: string | null;
    note: string | null;
  };
  pix: {
    enabled: boolean;
    total: number | null;
    discountPercent: number | null;
  };
  /** data limite geral de pagamento da opção (YYYY-MM-DD) */
  dueDate: string | null;
  note: string | null;
};

export function emptyPaymentOverride(): OptionPaymentOverride {
  return {
    enabled: false,
    card: { enabled: true, installments: null, amount: null, interestFree: true },
    boleto: { enabled: false, entrada: null, installments: null, amount: null, dueDate: null, note: null },
    pix: { enabled: true, total: null, discountPercent: null },
    dueDate: null,
    note: null,
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function cardList(total: number, ov: OptionPaymentOverride): Installment[] {
  const n = Math.max(1, Math.trunc(ov.card.installments ?? 1));
  const amount = ov.card.amount != null && ov.card.amount > 0 ? ov.card.amount : total / n;
  const out: Installment[] = [];
  for (let i = 1; i <= n; i++) {
    // Só a quantidade escolhida usa o valor digitado; as menores seguem o total.
    const valor = i === n ? amount : total / i;
    out.push({
      number: i,
      amount: round2(valor),
      total: round2(valor * i),
      interestFree: ov.card.interestFree,
    });
  }
  return out;
}

/** Aplica a configuração manual sobre o pagamento calculado automaticamente. */
export function applyPaymentOverride(
  base: PaymentConfiguration,
  total: number,
  ov?: OptionPaymentOverride | null,
): PaymentConfiguration {
  if (!ov?.enabled) return base;

  const methods: PaymentConfiguration["methods"] = [];
  if (ov.card.enabled) methods.push("CARD");
  if (ov.boleto.enabled) methods.push("BOLETO");
  if (ov.pix.enabled) methods.push("PIX");

  const pixPercent = ov.pix.discountPercent ?? base.pix.discountPercent ?? 0;
  const pixTotal =
    ov.pix.total != null && ov.pix.total > 0 ? ov.pix.total : round2(total * (1 - pixPercent / 100));

  const boletoParcelas = Math.max(1, Math.trunc(ov.boleto.installments ?? 1));
  const boletoValor =
    ov.boleto.amount != null && ov.boleto.amount > 0
      ? ov.boleto.amount
      : round2(Math.max(0, total - (ov.boleto.entrada ?? 0)) / boletoParcelas);

  return {
    ...base,
    methods: methods.length ? methods : ["PIX"],
    card: {
      ...base.card,
      enabled: ov.card.enabled,
      installments: ov.card.enabled ? cardList(total, ov) : [],
    },
    boleto: {
      ...base.boleto,
      enabled: ov.boleto.enabled,
      installments: [],
      untilTravel: null,
      note: ov.boleto.note ?? base.boleto.note ?? null,
      manual: ov.boleto.enabled
        ? {
            entrada: ov.boleto.entrada != null ? round2(ov.boleto.entrada) : null,
            installments: boletoParcelas,
            amount: round2(boletoValor),
            total: round2((ov.boleto.entrada ?? 0) + boletoValor * boletoParcelas),
            dueDate: ov.boleto.dueDate ?? null,
            note: ov.boleto.note ?? null,
          }
        : null,
    },
    pix: { enabled: ov.pix.enabled, discountPercent: pixPercent, total: round2(pixTotal) },
    dueDate: ov.dueDate ?? null,
    note: ov.note ?? null,
    manual: true,
  };
}
