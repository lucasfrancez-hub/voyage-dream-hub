/**
 * Tabela de parcelamento por OFERTA (etapa de busca).
 *
 * Fonte: regras VIA AIR, não da operadora.
 *   - até o teto sem juros da companhia (`airline-installments.ts`)
 *     → parcela = total ÷ n, sem acréscimo;
 *   - acima do teto → markup cadastrado em `airfare_installment_markups`
 *     (mesma tabela do Command Center), total = valor × (1 + markup).
 *
 * Nada é inventado: quando não há markup cadastrado para a quantidade, a
 * linha simplesmente não aparece. Os valores finais do cartão continuam
 * vindo do fornecedor em /checkouts/{id}/installments.
 * SERVER-ONLY.
 */
import { DEFAULT_EXTENDED_MARKUPS, type MarkupTable } from "@/lib/airfare-conditions";



let cache: { em: number; tabela: MarkupTable } | null = null;

/** Markups vigentes (cache de 5 minutos). */
export async function carregarMarkups(): Promise<MarkupTable> {
  if (cache && Date.now() - cache.em < 5 * 60_000) return cache.tabela;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("airfare_installment_markups")
      .select("installments,markup_percent")
      .eq("active", true);
    const tabela: MarkupTable = {};
    for (const row of (data ?? []) as Array<{ installments: number; markup_percent: number | string }>) {
      tabela[Number(row.installments)] = Number(row.markup_percent);
    }
    const final = Object.keys(tabela).length ? tabela : DEFAULT_EXTENDED_MARKUPS;
    cache = { em: Date.now(), tabela: final };
    return final;
  } catch {
    return DEFAULT_EXTENDED_MARKUPS;
  }
}


export { montarPlanoDeParcelamento } from "./installment-plan";
export type { ApiInstallmentPlan, ApiInstallmentOption } from "./installment-plan";
