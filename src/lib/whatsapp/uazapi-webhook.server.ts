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
  // @lid = Linked ID interno do WhatsApp, não é telefone real — ignora
  if (jid.includes("@lid")) return null;
  const clean = jid.split("@")[0]?.split(":")[0];
  if (!clean) return null;
  const digits = clean.replace(/\D/g, "");
  // BR/mundo: telefone tem entre 10 e 15 dígitos. LIDs costumam ter 14+ sem padrão de país
  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}

function pickJid(m: UazMessage): string {
  // prioriza chatid/remoteJid (JID real do chat) sobre sender (que pode vir como @lid)
  const candidates = [m.chatid, m.key?.remoteJid, m.sender];
  for (const c of candidates) {
    if (c && !c.includes("@lid")) return c;
  }
  return candidates.find((c) => !!c) ?? "";
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

    const jid = pickJid(m);
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
    // burst de mensagens (2+ em 30s): espera 2min pra pessoa terminar
    if ((recentBurst ?? 0) >= 2) waitMs = 2 * 60 * 1000;
    // já tinha debounce ativo (follow-up): espera só 60s
    else if (convState?.ai_debounce_until) waitMs = 60 * 1000;
    // primeira msg: 90s pra dar tempo de vir mais
    else waitMs = 90 * 1000;


    await supabaseAdmin
      .from("wa_conversations")
      .update({ ai_debounce_until: new Date(Date.now() + waitMs).toISOString() })
      .eq("id", conv.id);
  }
}
