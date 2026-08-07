/**
 * Pausa da IA nas conversas de COMENTÁRIO do Instagram (por publicação).
 *
 * Quando o atendente pausa a IA numa publicação, nenhuma resposta automática
 * sai mais ali — nem a resposta pública, nem o direct de convite. Vale para o
 * webhook (que gera a resposta) e para o cron da fila (que envia as agendadas).
 *
 * SERVER-ONLY.
 */

export async function isCommentAiPaused(mediaId: string | null | undefined): Promise<boolean> {
  if (!mediaId) return false;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("instagram_comment_ai_pauses")
      .select("paused")
      .eq("media_id", mediaId)
      .maybeSingle();
    return (data as { paused?: boolean | null } | null)?.paused === true;
  } catch {
    return false;
  }
}

/** Conjunto das publicações com IA pausada (consulta em lote pro cron). */
export async function pausedMediaIds(mediaIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(mediaIds.filter(Boolean))];
  if (ids.length === 0) return new Set();
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("instagram_comment_ai_pauses")
      .select("media_id, paused")
      .in("media_id", ids);
    return new Set(
      ((data ?? []) as Array<{ media_id: string; paused: boolean }>)
        .filter((r) => r.paused)
        .map((r) => r.media_id),
    );
  } catch {
    return new Set();
  }
}

/** A IA está pausada nesta conversa de DM (espelho no inbox do chat)? */
export async function isDmAiPaused(waPhone: string): Promise<boolean> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("wa_conversations")
      .select("mode, ai_paused")
      .eq("wa_phone", waPhone)
      .maybeSingle();
    const c = data as { mode?: string | null; ai_paused?: boolean | null } | null;
    if (!c) return false;
    return c.ai_paused === true || c.mode === "human";
  } catch {
    return false;
  }
}
