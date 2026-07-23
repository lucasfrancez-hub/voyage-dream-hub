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
    extendedTextMessage?: { text?: string; contextInfo?: UazContextInfo };
    audioMessage?: { url?: string; mimetype?: string };
    imageMessage?: { url?: string; caption?: string; mimetype?: string; contextInfo?: UazContextInfo };
  };
  contextInfo?: UazContextInfo;
  quoted?: { id?: string; text?: string; participant?: string | null };
  messageTimestamp?: number;
};

type UazContextInfo = {
  stanzaId?: string;
  stanzaid?: string;
  participant?: string | null;
  quotedMessage?: {
    conversation?: string;
    extendedTextMessage?: { text?: string };
    imageMessage?: { caption?: string };
    videoMessage?: { caption?: string };
    documentMessage?: { fileName?: string; caption?: string };
  };
};

function extractQuoted(m: UazMessage): { id: string; snippet: string; sender: string | null } | null {
  const ctx =
    m.message?.extendedTextMessage?.contextInfo ??
    m.message?.imageMessage?.contextInfo ??
    m.contextInfo;
  const stanzaId = ctx?.stanzaId ?? ctx?.stanzaid ?? m.quoted?.id;
  if (!stanzaId) return null;
  const qm = ctx?.quotedMessage;
  const text =
    qm?.conversation ??
    qm?.extendedTextMessage?.text ??
    qm?.imageMessage?.caption ??
    qm?.videoMessage?.caption ??
    qm?.documentMessage?.caption ??
    qm?.documentMessage?.fileName ??
    m.quoted?.text ??
    "";
  const rawSender = ctx?.participant ?? m.quoted?.participant ?? null;
  const sender = rawSender ? rawSender.split("@")[0]?.split(":")[0] ?? null : null;
  return { id: stanzaId, snippet: (text ?? "").slice(0, 240), sender };
}

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
  // Telefones reais: 10-13 dígitos (BR: 55 + DDD + 8/9). LIDs costumam ter 14+.
  if (digits.length < 10 || digits.length > 13) return null;
  return digits;
}

function hasLidMarker(m: UazMessage): boolean {
  const cands = [m.chatid, m.key?.remoteJid, m.sender];
  return cands.some((c) => typeof c === "string" && c.includes("@lid"));
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
  const isDelete =
    event.includes("delete") ||
    event.includes("revoke") ||
    event.includes("update");
  if (event && !event.includes("message") && !isDelete) {
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
  const { supabaseAdmin: adminForDeletes } = await import(
    "@/integrations/supabase/client.server"
  );

  for (const m of rawList) {
    const fromMe = m.fromMe ?? m.key?.fromMe ?? false;

    // Detecta deleção "apagar para todos" (protocolMessage REVOKE ou evento delete/revoke/update)
    const anyM = m as unknown as {
      messageStubType?: string;
      messageStubParameters?: string[];
      message?: { protocolMessage?: { type?: string | number; key?: { id?: string; remoteJid?: string } } };
      wasDeleted?: boolean;
      isDeleted?: boolean;
      deleted?: boolean;
      status?: string;
      update?: { message?: unknown; messageStubType?: string };
    };
    const protoType = anyM.message?.protocolMessage?.type;
    const isRevoke =
      anyM.wasDeleted === true ||
      anyM.isDeleted === true ||
      anyM.deleted === true ||
      anyM.messageStubType === "REVOKE" ||
      anyM.update?.messageStubType === "REVOKE" ||
      protoType === "REVOKE" ||
      protoType === 0 ||
      (isDelete && (anyM.update?.message === null || protoType != null || anyM.messageStubType != null));

    if (isRevoke) {
      const targetId =
        anyM.message?.protocolMessage?.key?.id ??
        anyM.messageStubParameters?.[0] ??
        m.id ??
        m.messageid ??
        m.key?.id;
      if (targetId) {
        const { data: upd, error: uErr } = await adminForDeletes
          .from("wa_messages")
          .update({
            deleted_at: new Date().toISOString(),
            deleted_by_customer: !fromMe,
          })
          .eq("wa_message_id", targetId)
          .select("id");
        console.log(
          "[uazapi] REVOKE detectado — target:",
          targetId,
          "fromMe=",
          fromMe,
          "rows=",
          upd?.length ?? 0,
          uErr ? `erro=${uErr.message}` : "",
        );
      } else {
        console.warn("[uazapi] REVOKE sem targetId identificável — payload:", JSON.stringify(m).slice(0, 500));
      }
      continue;
    }

    if (fromMe) continue;

    // Se QUALQUER identificador do payload é @lid, ignora — evita conversa duplicada
    if (hasLidMarker(m)) {
      console.log("[uazapi] mensagem ignorada (LID marker):", m.chatid ?? m.sender);
      continue;
    }

    const jid = pickJid(m);
    const phone = jidToPhone(jid);
    if (!phone) {
      console.log("[uazapi] jid inválido (provável LID), ignorado:", jid);
      continue;
    }




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

    const quoted = extractQuoted(m);

    const saved = await saveMessage({
      conversation_id: conv.id,
      direction: "inbound",
      sender: "customer",
      content,
      wa_message_id,
      reply_to_wa_id: quoted?.id ?? null,
      reply_to_snippet: quoted?.snippet ?? null,
      reply_to_sender: quoted?.sender ?? null,
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
