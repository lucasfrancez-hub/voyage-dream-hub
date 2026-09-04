/**
 * SILÊNCIO DA IA (janela de migração / sincronização de histórico).
 *
 * Regra do negócio: ao trocar o canal do WhatsApp e sincronizar as conversas
 * antigas, a IA precisa APENAS registrar tudo — nada de responder mensagens
 * antigas nem as de hoje. O silêncio vale até o fim do dia (America/Sao_Paulo)
 * definido em `wa_ai_switch.ai_silence_until`.
 *
 * SERVER-ONLY.
 */

const CACHE_MS = 10_000;
let cache: { value: number | null; at: number } | null = null;

/** Epoch (ms) até quando a IA fica calada; null quando não há silêncio ativo. */
export async function aiSilenceUntilMs(): Promise<number | null> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  let value: number | null = null;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("wa_ai_switch")
      .select("ai_silence_until")
      .eq("id", "global")
      .maybeSingle();
    const iso = (data as { ai_silence_until?: string | null } | null)?.ai_silence_until ?? null;
    const ms = iso ? new Date(iso).getTime() : NaN;
    value = Number.isFinite(ms) ? ms : null;
  } catch {
    value = cache?.value ?? null;
  }
  cache = { value, at: Date.now() };
  return value;
}

export function resetAiSilenceCache(): void {
  cache = null;
}

/** true quando a IA ainda está no período de silêncio (agora). */
export async function isAiSilenced(): Promise<boolean> {
  const until = await aiSilenceUntilMs();
  return until !== null && Date.now() < until;
}

/**
 * true quando esta mensagem NÃO pode acionar a IA: ou chegou dentro da janela
 * de silêncio (histórico/hoje), ou a janela ainda está aberta agora.
 */
export async function deveIgnorarParaIA(messageTimestampMs: number): Promise<boolean> {
  const until = await aiSilenceUntilMs();
  if (until === null) return false;
  return messageTimestampMs < until || Date.now() < until;
}

/** Fim do dia de hoje em America/Sao_Paulo, em ISO (para reativar o silêncio). */
export function fimDoDiaSaoPauloIso(base = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [y, m, d] = fmt.format(base).split("-").map(Number);
  // 00:00 do dia seguinte em São Paulo = 03:00 UTC (UTC-3, sem horário de verão).
  return new Date(Date.UTC(y, m - 1, d + 1, 3, 0, 0)).toISOString();
}
