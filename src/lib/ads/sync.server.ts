/**
 * Sincronização de métricas dos impulsionamentos com a Meta (Ads Insights API).
 * Usada pelo botão "Atualizar dados" e pelo cron a cada 15 minutos.
 */
import { buscarInsights, buscarStatusCampanha, MetaAdsError } from "./meta-ads.server";

export type BoostLinha = {
  id: string;
  campaign_id: string | null;
  objetivo: string;
  end_date: string;
  status: string;
};

/** Traduz o status efetivo da Meta para os status simples da dashboard. */
function statusDashboard(efetivo: string | null, fim: string): string {
  const e = (efetivo ?? "").toUpperCase();
  if (["DISAPPROVED", "WITH_ISSUES", "ADSET_PAUSED_DISAPPROVED"].includes(e)) return "erro";
  if (e === "PENDING_REVIEW" || e === "IN_PROCESS") return "em_analise";
  if (e === "PAUSED" || e === "CAMPAIGN_PAUSED" || e === "ADSET_PAUSED") return "pausado";
  if (e === "ARCHIVED" || e === "DELETED") return "finalizado";
  if (new Date(`${fim}T23:59:59-03:00`).getTime() < Date.now()) return "finalizado";
  if (e === "ACTIVE") return "ativo";
  return "em_analise";
}

export async function sincronizarUmBoost(boost: BoostLinha) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  if (!boost.campaign_id) return { ok: false as const, erro: "Campanha não criada na Meta." };

  try {
    const [insights, situacao] = await Promise.all([
      buscarInsights(boost.campaign_id, boost.objetivo),
      buscarStatusCampanha(boost.campaign_id),
    ]);

    const novoStatus = statusDashboard(situacao.effective_status, boost.end_date);
    await supabaseAdmin
      .from("meta_ad_boosts")
      .update({
        insights: insights as never,
        effective_status: situacao.effective_status,
        status: novoStatus,
        meta_error: novoStatus === "erro" ? (situacao.motivo ?? "Anúncio reprovado pela Meta.") : null,
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", boost.id);

    return { ok: true as const, insights, status: novoStatus };
  } catch (e) {
    const msg = e instanceof MetaAdsError ? e.message : (e as Error).message;
    await supabaseAdmin
      .from("meta_ad_boosts")
      .update({ meta_error: msg, last_synced_at: new Date().toISOString() })
      .eq("id", boost.id);
    return { ok: false as const, erro: msg };
  }
}

/** Sincroniza em lote (cron). Só o que ainda pode mudar. */
export async function sincronizarPendentes(limite = 25) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("meta_ad_boosts")
    .select("id, campaign_id, objetivo, end_date, status")
    .not("campaign_id", "is", null)
    .in("status", ["em_analise", "ativo", "pausado"])
    .order("last_synced_at", { ascending: true, nullsFirst: true })
    .limit(limite);

  const resultados: Array<{ id: string; ok: boolean }> = [];
  for (const boost of data ?? []) {
    const r = await sincronizarUmBoost(boost as BoostLinha);
    resultados.push({ id: boost.id, ok: r.ok });
  }
  return resultados;
}
