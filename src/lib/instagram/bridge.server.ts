/**
 * Ponte Instagram → inbox do chatbot.
 *
 * As DMs do Instagram vivem em `instagram_conversations` / `instagram_messages`,
 * mas o painel (/chat) lê de `wa_conversations` / `wa_messages`. Aqui espelhamos
 * cada DM numa conversa "virtual" com `wa_phone = ig:<contact_ig_id>` e
 * `meta.channel = "instagram"`, pra que apareça no mesmo inbox.
 */

export const IG_PREFIX = "ig:";

export function isInstagramConversation(waPhone: string | null | undefined) {
  return !!waPhone?.startsWith(IG_PREFIX);
}

export function igContactIdFromPhone(waPhone: string) {
  return waPhone.slice(IG_PREFIX.length);
}

type MirrorInput = {
  igAccountRowId: string;
  igConversationId: string;
  contactIgId: string;
  displayName?: string | null;
  username?: string | null;
  profilePic?: string | null;
  direction: "inbound" | "outbound";
  text: string | null;
  messageType?: string | null;
  attachmentUrl?: string | null;
  igMessageId?: string | null;
  timestamp?: number | null;
  /** Backfill histórico: não abre/atualiza protocolo. */
  skipProtocolo?: boolean;
};

/** Cria/atualiza a conversa espelho e grava a mensagem no inbox do chat. */
export async function mirrorInstagramMessage(input: MirrorInput) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const waPhone = `${IG_PREFIX}${input.contactIgId}`;
  const preview = (input.text ?? "[mídia]").slice(0, 140);
  const when = new Date(input.timestamp ?? Date.now()).toISOString();

  const { data: existing } = await supabaseAdmin
    .from("wa_conversations")
    .select("id, meta, unread_count, display_name")
    .eq("wa_phone", waPhone)
    .maybeSingle();

  let conversationId = existing?.id ?? null;

  if (!conversationId) {
    const { data: created, error } = await supabaseAdmin
      .from("wa_conversations")
      .insert({
        wa_phone: waPhone,
        display_name:
          input.displayName ?? (input.username ? `@${input.username}` : `Instagram ${input.contactIgId.slice(-6)}`),
        last_message_at: when,
        last_message_preview: preview,
        unread_count: input.direction === "inbound" ? 1 : 0,
        meta: {
          channel: "instagram",
          ig_account_id: input.igAccountRowId,
          ig_conversation_id: input.igConversationId,
          ig_contact_id: input.contactIgId,
          ig_username: input.username ?? null,
          ig_profile_pic: input.profilePic ?? null,
        },
      })
      .select("id")
      .single();
    if (error) throw new Error(`espelho instagram: ${error.message}`);
    conversationId = created!.id;
  } else {
    const meta = (existing?.meta ?? {}) as Record<string, unknown>;
    await supabaseAdmin
      .from("wa_conversations")
      .update({
        last_message_at: when,
        last_message_preview: preview,
        unread_count:
          input.direction === "inbound" ? (existing?.unread_count ?? 0) + 1 : existing?.unread_count ?? 0,
        ...(input.displayName &&
        (!existing?.display_name || existing.display_name.startsWith("Instagram ") || existing.display_name === "sem nome")
          ? { display_name: input.displayName }
          : {}),
        meta: {
          ...meta,
          channel: "instagram",
          ig_account_id: input.igAccountRowId,
          ig_conversation_id: input.igConversationId,
          ig_contact_id: input.contactIgId,
          ...(input.username ? { ig_username: input.username } : {}),
          ...(input.profilePic ? { ig_profile_pic: input.profilePic } : {}),
        },
      })
      .eq("id", conversationId);
  }

  const { saveMessage } = await import("@/lib/whatsapp/conversation.server");
  await saveMessage({
    conversation_id: conversationId!,
    direction: input.direction,
    sender: input.direction === "inbound" ? "customer" : "human",
    content: input.text ?? (input.attachmentUrl ? "[mídia do Instagram]" : "[mensagem]"),
    wa_message_id: input.igMessageId ?? null,
    message_type: input.messageType ?? "text",
    skip_protocolo: input.skipProtocolo ?? false,
  });

  return { conversationId: conversationId!, waPhone };
}
