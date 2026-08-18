import { sincronizarPlanilhas, FONTES } from "./sync.server";
import { processarFilaVoos } from "./voos.server";
import type { CativaFonte } from "./types";

const LOCK = "cativa-sync";
const LOCK_MINUTOS = 15;

/** Trava de execução única: um segundo disparo sai sem rodar. */
async function tentarTravar(): Promise<{ ok: boolean; pausado?: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const agora = new Date();
  const { data } = await supabaseAdmin.from("cativa_job_locks").select("*").eq("nome", LOCK).maybeSingle();

  if (data && (data as any).pausado) return { ok: false, pausado: (data as any).pausado_motivo || "pausado" };
  if (data && new Date((data as any).expira_em) > agora) return { ok: false };

  const expira = new Date(agora.getTime() + LOCK_MINUTOS * 60_000).toISOString();
  await supabaseAdmin
    .from("cativa_job_locks")
    .upsert({ nome: LOCK, expira_em: expira, updated_at: agora.toISOString() } as any, { onConflict: "nome" });
  return { ok: true };
}

async function destravar() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("cativa_job_locks")
    .update({ expira_em: new Date().toISOString(), updated_at: new Date().toISOString() } as any)
    .eq("nome", LOCK);
}

export type RodadaOpcoes = {
  fontes?: CativaFonte[];
  planilhas?: boolean;
  voos?: boolean;
  limiteVoos?: number;
};

/** Uma rodada do robô: planilhas (barato) + um lote limitado de voos. */
export async function rodarCativa(opts: RodadaOpcoes = {}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const trava = await tentarTravar();
  if (!trava.ok) return { skipped: true, motivo: trava.pausado ?? "execução em andamento" };

  const inicio = Date.now();
  const { data: run } = await supabaseAdmin
    .from("cativa_import_runs")
    .insert({ fonte: (opts.fontes ?? FONTES).join(","), status: "running" } as any)
    .select("id")
    .maybeSingle();
  const runId = (run as any)?.id as string | undefined;

  try {
    const planilhas = opts.planilhas === false ? null : await sincronizarPlanilhas(opts.fontes ?? FONTES);
    const voos = opts.voos === false ? null : await processarFilaVoos(opts.limiteVoos ?? 15);

    if (runId) {
      await supabaseAdmin
        .from("cativa_import_runs")
        .update({
          status: "ok",
          linhas: planilhas?.linhas ?? 0,
          novos: planilhas?.novos ?? 0,
          alterados: planilhas?.alterados ?? 0,
          inalterados: planilhas?.inalterados ?? 0,
          removidos: planilhas?.removidos ?? 0,
          infotravel_chamadas: voos?.processados ?? 0,
          infotravel_evitadas: planilhas?.evitados_infotravel ?? 0,
          infotravel_erros: voos?.erros ?? 0,
          detalhes: { planilhas, voos } as any,
          finalizado_em: new Date().toISOString(),
          duracao_ms: Date.now() - inicio,
        } as any)
        .eq("id", runId);
    }
    return { skipped: false, planilhas, voos };
  } catch (e) {
    if (runId) {
      await supabaseAdmin
        .from("cativa_import_runs")
        .update({
          status: "erro",
          erro: (e as Error).message.slice(0, 800),
          finalizado_em: new Date().toISOString(),
          duracao_ms: Date.now() - inicio,
        } as any)
        .eq("id", runId);
    }
    throw e;
  } finally {
    await destravar();
  }
}
