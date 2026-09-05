import { createFileRoute } from "@tanstack/react-router";

/**
 * Webhook do WhatsApp via UazAPI (canal do chatbot).
 *
 * Segurança: a UazAPI não assina o corpo, então exigimos um token secreto
 * (`?token=` ou header `x-uaz-token`) igual a UAZAPI_WEBHOOK_TOKEN.
 */
export const Route = createFileRoute("/api/public/uazapi-webhook")({
  server: {
    handlers: {
      GET: async () => new Response("ok", { status: 200 }),

      POST: async ({ request }) => {
        const esperado = process.env.UAZAPI_WEBHOOK_TOKEN;
        if (!esperado) {
          console.error("[uaz-webhook] UAZAPI_WEBHOOK_TOKEN não configurado");
          return new Response("Server misconfigured", { status: 500 });
        }
        const url = new URL(request.url);
        const recebido = url.searchParams.get("token") ?? request.headers.get("x-uaz-token") ?? "";
        if (recebido !== esperado) return new Response("Invalid token", { status: 401 });

        let payload: unknown = null;
        try {
          payload = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        try {
          await processarEvento(payload);
        } catch (err) {
          console.error("[uaz-webhook] erro processando:", err);
        }

        return new Response("EVENT_RECEIVED", { status: 200 });
      },
    },
  },
});

async function processarEvento(payload: unknown) {
  if (!payload || typeof payload !== "object") return;
  const p = payload as Record<string, unknown>;

  const tipoEvento = String(p.EventType ?? p.event ?? p.type ?? "").toLowerCase();

  // Mensagem apagada para todos (revoke): mantemos o conteúdo, só marcamos.
  if (tipoEvento.includes("revoke") || tipoEvento.includes("delete")) {
    await processarRevogacao(p);
    return;
  }

  // Eventos de ACK (messages.update): atualizam enviado/entregue/lido das mensagens.
  if (tipoEvento.includes("update") || tipoEvento.includes("ack") || tipoEvento.includes("status")) {
    if (await processarRevogacao(p)) return;
    await processarAtualizacaoStatus(p);
    return;
  }


  if (tipoEvento && !tipoEvento.includes("message")) return; // presença, conexão, etc.

  // Alguns payloads de ACK chegam sem EventType claro: mensagem com "status" e sem texto/mídia.
  if (!tipoEvento && pareceAtualizacaoStatus(p)) {
    await processarAtualizacaoStatus(p);
    return;
  }


  const brutas: unknown[] = Array.isArray(p.messages)
    ? (p.messages as unknown[])
    : p.message
      ? [p.message]
      : Array.isArray(p.data)
        ? (p.data as unknown[])
        : [p];

  const { normalizeUazMessage } = await import("@/lib/whatsapp/uaz-channel.server");
  const { ingestUazMessage } = await import("@/lib/whatsapp/uaz-ingest.server");

  for (const bruta of brutas) {
    const msg = normalizeUazMessage(bruta);
    if (!msg) continue;
    const resultado = await ingestUazMessage(msg);
    console.log(
      JSON.stringify({ event: "uaz_inbound", wa_message_id: msg.id, tipo: msg.type, resultado }),
    );
  }
}

/** Mapeia o ack do WhatsApp/UazAPI para o nosso delivery_status. */
function mapearStatus(status: unknown): "sent" | "delivered" | "read" | "failed" | null {
  if (typeof status === "number") {
    // WhatsApp ack: 1=pending, 2=sent, 3=delivered, 4=read, 5=played (áudio/vídeo lido)
    if (status === 2) return "sent";
    if (status === 3) return "delivered";
    if (status === 4 || status === 5) return "read";
    if (status < 0) return "failed";
    return null;
  }
  const s = String(status ?? "").toUpperCase();
  if (!s) return null;
  if (s.includes("READ") || s.includes("PLAYED") || s.includes("VIEWED")) return "read";
  if (s.includes("DELIVER")) return "delivered";
  if (s.includes("SENT") || s === "SERVER_ACK") return "sent";
  if (s.includes("FAIL") || s.includes("ERROR")) return "failed";
  return null;
}

function pareceAtualizacaoStatus(p: Record<string, unknown>): boolean {
  const msgs = Array.isArray(p.messages) ? p.messages : p.message ? [p.message] : [];
  return msgs.some((m) => {
    if (!m || typeof m !== "object") return false;
    const o = m as Record<string, unknown>;
    const temStatus = o.status !== undefined || o.ack !== undefined;
    const temConteudo = o.text !== undefined || o.body !== undefined || o.mediaUrl !== undefined;
    return temStatus && !temConteudo && (o.id ?? o.messageid ?? o.messageId) !== undefined;
  });
}

/**
 * Marca mensagens apagadas para todos, preservando o conteúdo no sistema.
 * Devolve true quando encontrou (e tratou) alguma revogação no payload.
 */
async function processarRevogacao(p: Record<string, unknown>): Promise<boolean> {
  const brutas: unknown[] = Array.isArray(p.messages)
    ? (p.messages as unknown[])
    : p.message
      ? [p.message]
      : Array.isArray(p.data)
        ? (p.data as unknown[])
        : [p];

  const alvos: Array<{ waId: string; fromMe: boolean }> = [];
  for (const bruta of brutas) {
    if (!bruta || typeof bruta !== "object") continue;
    const o = bruta as Record<string, unknown>;
    const tipo = String(o.messageType ?? o.type ?? "").toLowerCase();
    const revogado =
      o.isDeleted === true ||
      o.deleted === true ||
      o.wasDeleted === true ||
      o.isRevoked === true ||
      tipo.includes("revoke") ||
      tipo.includes("protocol");
    if (!revogado) continue;
    const alvo =
      o.deletedMessageId ??
      o.revokedMessageId ??
      (o.protocolMessage && typeof o.protocolMessage === "object"
        ? ((o.protocolMessage as Record<string, unknown>).key as Record<string, unknown> | undefined)?.id
        : undefined) ??
      o.id ??
      o.messageid ??
      o.messageId;
    const waId = String(alvo ?? "").trim();
    if (!waId) continue;
    alvos.push({ waId, fromMe: Boolean(o.fromMe ?? o.fromme) });
  }
  if (alvos.length === 0) return false;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const quando = new Date().toISOString();
  for (const alvo of alvos) {
    await supabaseAdmin
      .from("wa_messages")
      .update({
        is_revoked: true,
        revoked_at: quando,
        revoked_by: alvo.fromMe ? "business" : "customer",
      })
      .eq("wa_message_id", alvo.waId);
    console.log(JSON.stringify({ event: "uaz_revoke", wa_message_id: alvo.waId }));
  }
  return true;
}

async function processarAtualizacaoStatus(p: Record<string, unknown>) {

  const brutas: unknown[] = Array.isArray(p.messages)
    ? (p.messages as unknown[])
    : p.message
      ? [p.message]
      : Array.isArray(p.data)
        ? (p.data as unknown[])
        : [p];

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  for (const bruta of brutas) {
    if (!bruta || typeof bruta !== "object") continue;
    const o = bruta as Record<string, unknown>;
    const waId = String(o.id ?? o.messageid ?? o.messageId ?? o.key ?? "").trim();
    const status = mapearStatus(o.status ?? o.ack ?? o.messageStatus);
    if (!waId || !status) continue;

    const quando = new Date().toISOString();
    const patch: Record<string, unknown> = { delivery_status: status, delivery_status_at: quando };
    if (status === "delivered") patch.delivered_at = quando;
    if (status === "read") {
      patch.read_at = quando;
      patch.delivered_at = quando; // lida implica entregue
    }

    // Nunca regride o status: read > delivered > sent.
    const { data: atual } = await supabaseAdmin
      .from("wa_messages")
      .select("delivery_status, delivered_at, read_at")
      .eq("wa_message_id", waId)
      .maybeSingle();
    if (!atual) continue; // mensagem não é nossa (ex.: enviada por outro canal)
    const peso: Record<string, number> = { sent: 1, delivered: 2, read: 3, failed: 4 };
    const anterior = (atual as { delivery_status?: string | null }).delivery_status ?? null;
    if (anterior && status !== "failed" && (peso[anterior] ?? 0) > peso[status]) {
      delete patch.delivery_status;
      delete patch.delivery_status_at;
    }
    if ((atual as { delivered_at?: string | null }).delivered_at) delete patch.delivered_at;
    if ((atual as { read_at?: string | null }).read_at) delete patch.read_at;
    if (!Object.keys(patch).length) continue;

    const { error } = await supabaseAdmin
      .from("wa_messages")
      .update(patch as never)
      .eq("wa_message_id", waId);
    if (error) console.error("[uaz-webhook] falha ao registrar status:", error.message);
    else console.log(JSON.stringify({ event: "uaz_status", wa_message_id: waId, status }));
  }
}
