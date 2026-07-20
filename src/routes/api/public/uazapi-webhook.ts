import { createFileRoute } from "@tanstack/react-router";

/**
 * Webhook da UazAPI (WhatsApp não-oficial via QR Code).
 * A UazAPI envia POSTs para este endpoint quando chega mensagem, muda status, etc.
 *
 * Configurar no painel da instância (viaair.uazapi.com):
 *   URL: https://pedidos.viaair.tur.br/api/public/uazapi-webhook
 *   Eventos: messages (obrigatório), messages_update (opcional)
 *
 * Segurança: valida pelo header `token` (o Instance Token da UazAPI).
 */
export const Route = createFileRoute("/api/public/uazapi-webhook")({
  server: {
    handlers: {
      GET: async () => new Response("uazapi webhook ok", { status: 200 }),

      POST: async ({ request }) => {
        const expected = process.env.UAZAPI_TOKEN;
        const got = request.headers.get("token") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
        if (expected && got && got !== expected) {
          console.warn("[uazapi-webhook] token inválido");
          return new Response("Invalid token", { status: 401 });
        }

        let payload: UazPayload;
        try {
          payload = (await request.json()) as UazPayload;
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }

        try {
          await processUaz(payload);
        } catch (err) {
          console.error("[uazapi-webhook] erro:", err);
        }
        return new Response("EVENT_RECEIVED", { status: 200 });
      },
    },
  },
});

type UazMessage = {
  id?: string;
  messageid?: string;
  key?: { id?: string; fromMe?: boolean; remoteJid?: string };
  fromMe?: boolean;
  sender?: string; // "5548...@s.whatsapp.net"
  chatid?: string;
  pushName?: string;
  senderName?: string;
  type?: string; // "text" | "audio" | ...
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
  // Só números
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

// matcher em módulo compartilhado (usado também pelo webhook Meta)


async function processUaz(payload: UazPayload) {
  const event = (payload.event ?? payload.EventType ?? "").toLowerCase();
  // Aceita "messages", "messages.upsert", "message", "onmessage" etc.
  if (event && !event.includes("message")) {
    console.log("[uazapi-webhook] evento ignorado:", event);
    return;
  }

  const rawList = Array.isArray(payload.data)
    ? payload.data
    : payload.data
      ? [payload.data]
      : payload.message
        ? [payload.message]
        : [];

  if (rawList.length === 0) {
    console.log("[uazapi-webhook] payload sem mensagens");
    return;
  }

  const { getOrCreateConversation, saveMessage } = await import("@/lib/whatsapp/conversation.server");

  for (const m of rawList) {
    const fromMe = m.fromMe ?? m.key?.fromMe ?? false;
    if (fromMe) continue; // ignora as próprias mensagens

    const jid = m.sender ?? m.chatid ?? m.key?.remoteJid ?? "";
    const phone = jidToPhone(jid);
    if (!phone) {
      console.warn("[uazapi-webhook] mensagem sem número:", JSON.stringify(m).slice(0, 200));
      continue;
    }

    const wa_message_id = m.id ?? m.messageid ?? m.key?.id ?? `${phone}-${Date.now()}`;
    const profileName = m.pushName ?? m.senderName ?? null;

    const content = extractText(m);
    if (!content) {
      console.log(`[uazapi-webhook] mensagem sem texto (type=${m.type ?? m.messageType}) — ignorada`);
      continue;
    }

    const conv = await getOrCreateConversation(phone, profileName);

    if (conv.mode === "resolved") {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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

    // Detecta resposta de botão do robô de alertas de voo (títulos fixos).
    // UazAPI não preserva IDs de botão — mapeamos pelo texto e casamos com o
    // alerta pendente mais recente pra esse telefone.
    const { matchFlightAlertButton } = await import("@/lib/whatsapp/flight-alert-match");
    const buttonAction = matchFlightAlertButton(content);
    if (buttonAction) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const variants = new Set<string>([phone]);
      if (phone.startsWith("55") && phone.length === 13) variants.add(phone.slice(0, 4) + phone.slice(5));
      else if (phone.startsWith("55") && phone.length === 12) variants.add(phone.slice(0, 4) + "9" + phone.slice(4));
      const { data: pending } = await supabaseAdmin
        .from("flight_change_alerts")
        .select("id")
        .in("wa_phone", Array.from(variants))
        .is("response", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (pending?.id) {
        const { handleFlightAlertReply } = await import("@/lib/whatsapp/flight-alert-reply.server");
        await handleFlightAlertReply({
          conversation_id: conv.id,
          wa_phone: phone,
          button_id: `flight_alert:${pending.id}:${buttonAction}`,
        });
        continue;
      }
    }



    // Mesma lógica de debounce adaptativo do webhook Meta.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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
