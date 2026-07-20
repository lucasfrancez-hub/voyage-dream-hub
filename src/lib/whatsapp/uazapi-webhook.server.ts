/**
 * Processador de payloads da UazAPI (compartilhado entre os webhooks
 * /api/public/uazapi-webhook e /api/public/uazapi-webhook/$).
 * SERVER-ONLY.
 */

type UazMessage = {
  id?: string;
  messageid?: string;
  key?: { id?: string; fromMe?: boolean; remoteJid?: string };
  fromMe?: boolean;
  sender?: string;
  chatid?: string;
  pushName?: string;
  senderName?: string;
  type?: string;
  messageType?: string;
  text?: string;
  content?: string;
  message?: {
    conversation?: string;
    extendedTextMessage?: { text?: string };
    audioMessage?: { url?: string; mimetype?: string };
    imageMessage?: { url?: string; caption?: string; mimetype?: string };
  };
  messageTimestamp?: number;
};

type UazPayload = {
  event?: string;
  EventType?: string;
  instance?: string;
  data?: UazMessage | UazMessage[];
  message?: UazMessage;
};

function jidToPhone(jid: string | undefined | null): string | null {
  if (!jid) return null;
  const clean = jid.split("@")[0]?.split(":")[0];
  if (!clean) return null;
  return clean.replace(/\D/g, "");
}

function extractText(m: UazMessage): string | null {
  return (
    m.text ??
    m.content ??
    m.message?.conversation ??
    m.message?.extendedTextMessage?.text ??
    m.message?.imageMessage?.caption ??
    null
  );
}

export async function processUazPayload(raw: unknown) {
  const payload = raw as UazPayload;
  const event = (payload.event ?? payload.EventType ?? "").toLowerCase();
  if (event && !event.includes("message")) {
    console.log("[uazapi] evento ignorado:", event);
    return;
  }

  const rawList: UazMessage[] = Array.isArray(payload.data)
    ? payload.data
    : payload.data
      ? [payload.data]
      : payload.message
        ? [payload.message]
        : [];

  if (rawList.length === 0) return;

  const { getOrCreateConversation, saveMessage } = await import(
    "@/lib/whatsapp/conversation.server"
  );

  for (const m of rawList) {
    const fromMe = m.fromMe ?? m.key?.fromMe ?? false;
    if (fromMe) continue;

    const jid = m.sender ?? m.chatid ?? m.key?.remoteJid ?? "";
    const phone = jidToPhone(jid);
    if (!phone) continue;

    const wa_message_id = m.id ?? m.messageid ?? m.key?.id ?? `${phone}-${Date.now()}`;
    const profileName = m.pushName ?? m.senderName ?? null;
    const content = extractText(m);
    if (!content) continue;

    const conv = await getOrCreateConversation(phone, profileName);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (conv.mode === "resolved") {
      await supabaseAdmin
        .from("wa_conversations")
        .update({ mode: "ai", funnel_stage: "novo", assigned_to: null })
        .eq("id", conv.id);
      conv.mode = "ai";
    }

    const saved = await saveMessage({
      conversation_id: conv.id,
      direction: "inbound",
      sender: "customer",
      content,
      wa_message_id,
    });
    if (!saved) continue;

    const { data: convState } = await supabaseAdmin
      .from("wa_conversations")
      .select("ai_debounce_until")
      .eq("id", conv.id)
      .maybeSingle();

    const thirtySecAgo = new Date(Date.now() - 30 * 1000).toISOString();
    const { count: recentBurst } = await supabaseAdmin
      .from("wa_messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conv.id)
      .eq("direction", "inbound")
      .gte("created_at", thirtySecAgo);

    let waitMs: number;
    if ((recentBurst ?? 0) >= 2) waitMs = 4 * 60 * 1000;
    else if (convState?.ai_debounce_until) waitMs = 3 * 60 * 1000;
    else waitMs = 90 * 1000;

    await supabaseAdmin
      .from("wa_conversations")
      .update({ ai_debounce_until: new Date(Date.now() + waitMs).toISOString() })
      .eq("id", conv.id);
  }
}
