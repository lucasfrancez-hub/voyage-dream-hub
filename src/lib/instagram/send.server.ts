import { sendDirectMessage, replyToComment, sendPrivateReplyToComment } from "./api.server";

type Account = { ig_user_id: string; access_token: string };

async function loadAccount(accountId: string): Promise<Account> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("instagram_accounts")
    .select("ig_user_id, access_token")
    .eq("id", accountId)
    .maybeSingle();
  if (error || !data?.access_token) {
    throw new Error(`instagram_account ${accountId} sem token`);
  }
  return data as Account;
}

/**
 * Envia uma DM e persiste a mensagem outbound.
 */
export async function sendInstagramDM(params: {
  conversationId: string;
  accountId: string;
  recipientIgId: string;
  text: string;
  sentBy?: string | null;
  agentSlug?: string | null;
}) {
  const acc = await loadAccount(params.accountId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  let result;
  let error: string | null = null;
  try {
    result = await sendDirectMessage({
      igUserId: acc.ig_user_id,
      token: acc.access_token,
      recipientIgId: params.recipientIgId,
      text: params.text,
    });
  } catch (e) {
    error = (e as Error).message;
  }

  await supabaseAdmin.from("instagram_messages").insert({
    conversation_id: params.conversationId,
    ig_message_id: result?.message_id ?? null,
    direction: "outbound",
    message_type: "text",
    text: params.text,
    sent_by: params.sentBy ?? null,
    sent_by_agent_slug: params.agentSlug ?? null,
    status: error ? "failed" : "sent",
    error,
  });

  await supabaseAdmin
    .from("instagram_conversations")
    .update({
      last_message_at: new Date().toISOString(),
      last_message_preview: params.text.slice(0, 140),
    })
    .eq("id", params.conversationId);

  if (error) throw new Error(error);
  return result;
}

const AVISO_COLLAB =
  "Publicação em colaboração: o Instagram só permite que o perfil que publicou responda ao comentário. " +
  "A resposta foi salva como sugestão — copie e publique pelo perfil dono do post.";

/** O Graph devolve 100/33 quando o comentário não pertence à conta (posts em collab). */
function ehComentarioDeOutroPerfil(erro: unknown): boolean {
  const msg = erro instanceof Error ? erro.message : String(erro);
  return /error_subcode":\s*33/.test(msg) || /does not exist, cannot be loaded due to missing permissions/i.test(msg);
}

/**
 * Responde um comentário publicamente + envia DM privada ao autor.
 * Em publicações collab a API bloqueia a resposta: guardamos como sugestão.
 */
export async function autoReplyComment(params: {
  accountId: string;
  commentId: string;
  publicReply: string;
  privateDm?: string | null;
  collab?: boolean;
}) {
  const acc = await loadAccount(params.accountId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const salvarSugestao = async () => {
    await supabaseAdmin
      .from("instagram_comments")
      .update({
        auto_reply_status: "suggested",
        auto_reply_text: params.publicReply,
        auto_replied_at: null,
      })
      .eq("comment_id", params.commentId);
  };

  if (params.collab) {
    await salvarSugestao();
    throw new Error(AVISO_COLLAB);
  }

  try {
    await replyToComment({
      commentId: params.commentId,
      token: acc.access_token,
      message: params.publicReply,
    });
    if (params.privateDm) {
      await sendPrivateReplyToComment({
        igUserId: acc.ig_user_id,
        token: acc.access_token,
        commentId: params.commentId,
        text: params.privateDm,
      });
    }
    await supabaseAdmin
      .from("instagram_comments")
      .update({
        auto_reply_status: "sent",
        auto_reply_text: params.publicReply,
        auto_replied_at: new Date().toISOString(),
        auto_dm_sent_at: params.privateDm ? new Date().toISOString() : null,
      })
      .eq("comment_id", params.commentId);
  } catch (e) {
    if (ehComentarioDeOutroPerfil(e)) {
      await salvarSugestao();
      throw new Error(AVISO_COLLAB);
    }
    await supabaseAdmin
      .from("instagram_comments")
      .update({ auto_reply_status: "failed", auto_reply_text: (e as Error).message })
      .eq("comment_id", params.commentId);
    throw e;
  }
}

