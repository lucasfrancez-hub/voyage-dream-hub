/**
 * Regras de parcelamento por operadora (tabela `installment_rules`).
 *
 * Cada regra casa com o nome do fornecedor/origem do pacote por um padrão
 * (lista de termos separados por `|`) e define:
 *  - máximo de parcelas sem juros (cartão e boleto financiado);
 *  - bandeiras restritas e o limite delas;
 *  - janela de validade (ex.: campanha FRT de 15x até 31/08).
 *
 * Fora da janela de validade a regra é ignorada e vale o padrão de 10x.
 */
import { supabase } from "@/integrations/supabase/client";
import { queryOptions } from "@tanstack/react-query";

export type InstallmentRule = {
  id: string;
  operator_label: string;
  match_pattern: string;
  max_installments: number;
  limited_brands: string[];
  limited_brands_max: number | null;
  valid_from: string | null;
  valid_until: string | null;
  priority: number;
  is_active: boolean;
  notes: string | null;
  /** Boleto bancário financiado disponível para esta operadora? */
  boleto_financiado_enabled: boolean;
  /** Máximo de parcelas no boleto financiado (null = mesmo limite do cartão). */
  boleto_financiado_max: number | null;
  /** Boleto pré-pago disponível para esta operadora? */
  boleto_prepago_enabled: boolean;
};

/** Bandeiras aceitas no checkout — usadas nos botões do admin. */
export const CARD_BRANDS = [
  "Visa",
  "Mastercard",
  "Elo",
  "Amex",
  "Hipercard",
  "Diners",
] as const;

/** Limite padrão de parcelas quando nenhuma regra se aplica. */
export const DEFAULT_MAX_INSTALLMENTS = 10;

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Regra está dentro da janela de validade hoje? */
export function isRuleActiveToday(rule: InstallmentRule, today = todayISO()): boolean {
  if (!rule.is_active) return false;
  if (rule.valid_from && today < rule.valid_from) return false;
  if (rule.valid_until && today > rule.valid_until) return false;
  return true;
}

function matchesRule(rule: InstallmentRule, haystack: string): boolean {
  return rule.match_pattern
    .split("|")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .some((t) => haystack.includes(t));
}

/** Regra vigente com maior prioridade para o fornecedor informado. */
export function findRule(
  rules: InstallmentRule[] | undefined,
  input: { supplierName?: string | null; source?: string | null },
  today = todayISO(),
): InstallmentRule | null {
  if (!rules?.length) return null;
  const hay = `${input.supplierName ?? ""} ${input.source ?? ""}`.toLowerCase();
  if (!hay.trim()) return null;
  const found = rules
    .filter((r) => isRuleActiveToday(r, today) && matchesRule(r, hay))
    .sort((a, b) => b.priority - a.priority);
  return found[0] ?? null;
}

/** Máximo de parcelas sem juros do pacote (independente da bandeira). */
export function maxInstallmentsForPackage(
  rules: InstallmentRule[] | undefined,
  input: { supplierName?: string | null; source?: string | null },
  today = todayISO(),
): number {
  const rule = findRule(rules, input, today);
  return rule ? rule.max_installments : DEFAULT_MAX_INSTALLMENTS;
}

/** Máximo de parcelas considerando a bandeira do cartão. */
export function maxInstallmentsForCard(
  rules: InstallmentRule[] | undefined,
  input: { supplierName?: string | null; source?: string | null; brand?: string | null },
  today = todayISO(),
): number {
  const rule = findRule(rules, input, today);
  const base = rule ? rule.max_installments : DEFAULT_MAX_INSTALLMENTS;
  if (!rule || rule.limited_brands_max == null) return base;
  const brand = String(input.brand ?? "").trim().toLowerCase();
  if (!brand) return base;
  const limited = rule.limited_brands.some((b) => b.trim().toLowerCase() === brand);
  return limited ? Math.min(base, rule.limited_brands_max) : base;
}

export const installmentRulesQuery = queryOptions({
  queryKey: ["installment-rules"],
  staleTime: 5 * 60 * 1000,
  queryFn: async (): Promise<InstallmentRule[]> => {
    const { data, error } = await supabase
      .from("installment_rules")
      .select(
        "id,operator_label,match_pattern,max_installments,limited_brands,limited_brands_max,valid_from,valid_until,priority,is_active,notes,boleto_financiado_enabled,boleto_financiado_max,boleto_prepago_enabled",
      )
      .eq("is_active", true)
      .order("priority", { ascending: false });
    if (error) throw error;
    return (data ?? []) as InstallmentRule[];
  },
});

export type BoletoRules = {
  /** Boleto financiado (com análise) liberado. */
  financedEnabled: boolean;
  /** Máximo de parcelas no boleto financiado. */
  financedMax: number;
  /** Boleto pré-pago liberado. */
  prepaidEnabled: boolean;
};

/** Regras de boleto vigentes para o pacote (espelham o admin). */
export function boletoRulesForPackage(
  rules: InstallmentRule[] | undefined,
  input: { supplierName?: string | null; source?: string | null },
  today = todayISO(),
): BoletoRules {
  const rule = findRule(rules, input, today);
  if (!rule) {
    return {
      financedEnabled: true,
      financedMax: DEFAULT_MAX_INSTALLMENTS,
      prepaidEnabled: true,
    };
  }
  return {
    financedEnabled: rule.boleto_financiado_enabled !== false,
    financedMax: rule.boleto_financiado_max ?? rule.max_installments,
    prepaidEnabled: rule.boleto_prepago_enabled !== false,
  };
}
