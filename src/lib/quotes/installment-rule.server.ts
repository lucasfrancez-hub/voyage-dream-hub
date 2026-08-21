/**
 * Regras de parcelamento da OPERADORA aplicadas aos orçamentos importados
 * (extensão FRT/Infotravel, Cativa, etc.).
 *
 * Fonte única: tabela `installment_rules` (mesma editada em
 * /admin/regras-parcelamento). Aqui só lemos e casamos o padrão com a origem
 * do orçamento — nada é hardcodado.
 */
import type { NormalizedQuote } from "./types";

export type QuoteInstallmentRule = {
  operatorLabel: string | null;
  cardMax: number;
  boletoMax: number;
  boletoFinanciadoEnabled: boolean;
  boletoPrepagoEnabled: boolean;
  limitedBrands: string[];
  limitedBrandsMax: number | null;
};

/** Padrão VIA AIR quando nenhuma regra casa. */
export const DEFAULT_QUOTE_RULE: QuoteInstallmentRule = {
  operatorLabel: null,
  cardMax: 10,
  boletoMax: 10,
  boletoFinanciadoEnabled: true,
  boletoPrepagoEnabled: true,
  limitedBrands: [],
  limitedBrandsMax: null,
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Texto usado para casar com o `match_pattern` das regras. */
export function operatorHint(normalized: NormalizedQuote | null | undefined): string {
  if (!normalized) return "";
  const source = String(normalized.source ?? "");
  // A extensão de importação usa "INFOTRAVEL", que é a plataforma da FRT.
  const alias = /infotravel/i.test(source) ? "frt infotravel" : "";
  return [source, alias, normalized.sourceUrl ?? ""].join(" ").toLowerCase();
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

function matches(row: Row, hay: string, today: string): boolean {
  if (row.valid_from && today < row.valid_from) return false;
  if (row.valid_until && today > row.valid_until) return false;
  return row.match_pattern
    .split("|")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .some((t) => hay.includes(t));
}

/** Regra vigente da operadora do orçamento (ou o padrão VIA AIR). */
export async function resolveQuoteInstallmentRule(
  normalized: NormalizedQuote | null | undefined,
): Promise<QuoteInstallmentRule> {
  const hay = operatorHint(normalized).trim();
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
    const rows = ((data ?? []) as unknown as Row[]).filter((r) => matches(r, hay, today));
    const rule = rows[0];
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
