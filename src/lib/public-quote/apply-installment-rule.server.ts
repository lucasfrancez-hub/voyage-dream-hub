/**
 * Reaplica a REGRA DE PARCELAMENTO VIGENTE (tabela `installment_rules`) sobre
 * um orçamento público já gravado.
 *
 * Motivo: o link público guarda um snapshot do pagamento. Quando a regra da
 * operadora muda ou expira (ex.: FRT 12x válida até 31/08/2026), o link antigo
 * continuava mostrando as parcelas antigas — divergindo do que está salvo em
 * /admin/regras-parcelamento.
 *
 * Nada é inventado aqui: apenas cortamos/desabilitamos o que a regra atual não
 * permite mais. Condições definidas manualmente pelo consultor são preservadas.
 */
import type { PaymentConfiguration, PublicQuote } from "./types";
import {
  DEFAULT_QUOTE_RULE,
  type QuoteInstallmentRule,
} from "@/lib/quotes/installment-rule.server";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

type Row = {
  operator_label: string;
  match_pattern: string;
  max_installments: number;
  limited_brands: string[] | null;
  limited_brands_max: number | null;
  valid_from: string | null;
  valid_until: string | null;
  priority: number;
  boleto_financiado_enabled: boolean | null;
  boleto_financiado_max: number | null;
  boleto_prepago_enabled: boolean | null;
};

/** Regra vigente para um "hint" de operadora (vazio = padrão VIA AIR). */
async function ruleForHint(hint: string): Promise<QuoteInstallmentRule> {
  const hay = (hint ?? "").trim().toLowerCase();
  if (!hay) return DEFAULT_QUOTE_RULE;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("installment_rules")
      .select(
        "operator_label,match_pattern,max_installments,limited_brands,limited_brands_max,valid_from,valid_until,priority,boleto_financiado_enabled,boleto_financiado_max,boleto_prepago_enabled",
      )
      .eq("is_active", true)
      .order("priority", { ascending: false });
    const today = todayISO();
    const rule = ((data ?? []) as unknown as Row[]).find((r) => {
      if (r.valid_from && today < r.valid_from) return false;
      if (r.valid_until && today > r.valid_until) return false;
      return r.match_pattern
        .split("|")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
        .some((t) => hay.includes(t));
    });
    if (!rule) return DEFAULT_QUOTE_RULE;
    return {
      operatorLabel: rule.operator_label ?? null,
      cardMax: Math.max(1, Number(rule.max_installments) || DEFAULT_QUOTE_RULE.cardMax),
      boletoMax: Math.max(
        1,
        Number(rule.boleto_financiado_max ?? rule.max_installments) || DEFAULT_QUOTE_RULE.boletoMax,
      ),
      boletoFinanciadoEnabled: rule.boleto_financiado_enabled !== false,
      boletoPrepagoEnabled: rule.boleto_prepago_enabled !== false,
      limitedBrands: rule.limited_brands ?? [],
      limitedBrandsMax: rule.limited_brands_max ?? null,
    };
  } catch {
    return DEFAULT_QUOTE_RULE;
  }
}

function applyToPayment(
  payment: PaymentConfiguration | undefined,
  rule: QuoteInstallmentRule,
  isAirOnly: boolean,
): PaymentConfiguration | undefined {
  if (!payment) return payment;
  // Condição montada à mão pelo consultor manda mais que a regra genérica.
  if (payment.manual === true) return payment;

  // Cartão: no somente-aéreo o teto vem da companhia/markup, não da operadora.
  const card = isAirOnly
    ? payment.card
    : {
        ...payment.card,
        installments: (payment.card?.installments ?? []).filter((i) => i.number <= rule.cardMax),
      };

  const boletoFinanciado = rule.boletoFinanciadoEnabled
    ? (payment.boleto?.installments ?? []).filter((i) => i.number <= rule.boletoMax)
    : [];
  const untilTravel = rule.boletoPrepagoEnabled ? (payment.boleto?.untilTravel ?? null) : null;
  const manualBoleto = payment.boleto?.manual ?? null;
  const boletoEnabled =
    !!manualBoleto || boletoFinanciado.length > 0 || untilTravel?.enabled === true;

  const boleto = {
    ...payment.boleto,
    enabled: payment.boleto?.enabled === true && boletoEnabled,
    installments: boletoFinanciado,
    note: boletoFinanciado.length ? (payment.boleto?.note ?? null) : null,
    untilTravel,
    manual: manualBoleto,
  };

  const methods = (payment.methods ?? []).filter((m) => (m === "BOLETO" ? boleto.enabled : true));

  return { ...payment, methods, card, boleto };
}

/** Aplica a regra vigente no orçamento e em todas as suas opções. */
export async function applyCurrentInstallmentRule(quote: PublicQuote): Promise<PublicQuote> {
  // Orçamentos antigos não guardam a operadora (`installmentHint`). Nesse caso
  // NÃO dá pra saber qual regra gerou o snapshot: aplicar o padrão VIA AIR
  // cortaria parcelas legítimas (ex.: FRT 12x virando 10x). Preserva o snapshot.
  const hint = (quote.installmentHint ?? "").trim();
  if (!hint) return quote;
  const rule = await ruleForHint(hint);
  const isAirOnly = quote.type === "AIR_ONLY";
  return {
    ...quote,
    payment: applyToPayment(quote.payment, rule, isAirOnly) ?? quote.payment,
    options: quote.options?.map((o) => ({
      ...o,
      payment: applyToPayment(o.payment, rule, isAirOnly) ?? o.payment,
    })),
  };
}
