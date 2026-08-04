/**
 * Comentários de publicações em COLABORAÇÃO (collab).
 *
 * Quando o reel é publicado pelo perfil pessoal e a VIA AIR entra como
 * coautora, a Meta manda o webhook de comentário SÓ pro dono do post. Como a
 * publicação também aparece no perfil da VIA AIR, os comentários precisam cair
 * no chat e ser respondidos pela IA do mesmo jeito.
 *
 * Solução: varredura periódica das publicações marcadas (/tags), que inclui os
 * collabs, comparando com o que já está salvo em instagram_comments.
 */

export type CollabSyncResult = {
  contas: number;
  publicacoes: number;
  novos: number;
  respondidos: number;
  erros: string[];
};

export async function syncCollabComments(): Promise<CollabSyncResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const resultado: CollabSyncResult = { contas: 0, publicacoes: 0, novos: 0, respondidos: 0, erros: [] };

  const { data: contas } = await supabaseAdmin
    .from("instagram_accounts")
    .select("id, ig_user_id, page_id, username, access_token")
    .eq("active", true);

  for (const conta of contas ?? []) {
    if (!conta.access_token) continue;
    resultado.contas++;
    const igUserId = conta.page_id || conta.ig_user_id;

    let midias: Awaited<ReturnType<typeof import("@/lib/instagram/api.server").fetchTaggedMediaWithComments>> = [];
    try {
      const { fetchTaggedMediaWithComments } = await import("@/lib/instagram/api.server");
      midias = await fetchTaggedMediaWithComments({ igUserId, token: conta.access_token, mediaLimit: 8 });
    } catch (e) {
      resultado.erros.push(`tags ${conta.username ?? igUserId}: ${(e as Error).message}`);
      continue;
    }

    for (const midia of midias) {
      if (!midia.comments.length) continue;
      resultado.publicacoes++;

      const ids = midia.comments.map((c) => c.id);
      const { data: existentes } = await supabaseAdmin
        .from("instagram_comments")
        .select("comment_id, auto_reply_status")
        .in("comment_id", ids);
      const jaTem = new Map((existentes ?? []).map((r) => [r.comment_id, r.auto_reply_status]));

      // Do mais antigo pro mais novo, pra respeitar a ordem da conversa.
      const aTratar = midia.comments
        .filter((c) => c.id)
        .filter((c) => !conta.username || c.username?.toLowerCase() !== conta.username.toLowerCase())
        .filter((c) => !jaTem.has(c.id) || jaTem.get(c.id) === "pending")
        .sort((a, b) => (a.timestamp ?? "").localeCompare(b.timestamp ?? ""));

      for (const c of aTratar) {
        if (!jaTem.has(c.id)) {
          const { error } = await supabaseAdmin.from("instagram_comments").insert({
            account_id: conta.id,
            media_id: midia.mediaId,
            comment_id: c.id,
            parent_comment_id: c.parentId ?? null,
            from_username: c.username ?? null,
            text: c.text ?? null,
            media_caption: midia.caption,
            media_thumbnail: midia.thumbnail,
            media_type: midia.mediaType,
            media_permalink: midia.permalink,
            created_at: c.timestamp ?? new Date().toISOString(),
            metadata: { origem: "collab_sync", collab: true },
          });
          if (error) {
            resultado.erros.push(`insert ${c.id}: ${error.message}`);
            continue;
          }
          resultado.novos++;
        }


        try {
          const { isAiGloballyOff } = await import("@/lib/whatsapp/ai-global-switch.server");
          if (await isAiGloballyOff()) continue;

          const { gerarRespostaComentario } = await import("@/lib/instagram/comment-ai.server");
          const resposta = await gerarRespostaComentario({
            fromUsername: c.username ?? null,
            text: c.text ?? null,
            mediaCaption: midia.caption,
            mediaPermalink: midia.permalink,
          });
          if (!resposta) continue;

          // Em post de colaboração quem responde publicamente e manda direct é
          // só o perfil DONO da publicação — a Meta bloqueia o coautor. Então
          // aqui guardamos a resposta como SUGESTÃO pra equipe enviar.
          await supabaseAdmin
            .from("instagram_comments")
            .update({
              auto_reply_status: "suggestion",
              auto_reply_text: resposta.publica,
              dm_text: resposta.dm ?? null,
            })
            .eq("comment_id", c.id);
          resultado.respondidos++;

        } catch (e) {
          resultado.erros.push(`resposta ${c.id}: ${(e as Error).message}`);
        }
      }
    }
  }

  return resultado;
}
