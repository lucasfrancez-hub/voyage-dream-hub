import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * Webhook Instagram Graph API (Meta).
 *
 * GET  → hub challenge (verify)
 * POST → mensagens (DMs) + comentários (mentions/comments) + deletions
 */
export const Route = createFileRoute("/api/public/instagram-webhook")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        const expected = process.env.META_IG_VERIFY_TOKEN_V2 ?? process.env.META_IG_VERIFY_TOKEN ?? process.env.WHATSAPP_VERIFY_TOKEN_USER;
        if (mode === "subscribe" && token && expected && token === expected) {
          return new Response(challenge ?? "", { status: 200 });
        }
        return new Response("Forbidden", { status: 403 });
      },

      POST: async ({ request }) => {
        const raw = await request.text();
        const signature = request.headers.get("x-hub-signature-256") ?? "";
        const appSecret = process.env.META_APP_SECRET;
        if (!appSecret) return new Response("Server misconfigured", { status: 500 });

        const expected = "sha256=" + createHmac("sha256", appSecret).update(raw).digest("hex");
        const a = Buffer.from(signature);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return new Response("Invalid signature", { status: 401 });
        }

        try {
          await processPayload(JSON.parse(raw));
        } catch (err) {
          console.error("[ig-webhook] erro processando:", err);
        }
        return new Response("EVENT_RECEIVED", { status: 200 });
      },
    },
  },
});

type IGPayload = {
  object?: string;
  entry?: Array<{
    id?: string;
    time?: number;
    messaging?: Array<{
      sender?: { id: string };
      recipient?: { id: string };
      timestamp?: number;
      message?: {
        mid?: string;
        text?: string;
        attachments?: Array<{ type: string; payload: { url: string } }>;
        is_deleted?: boolean;
        reply_to?: { mid?: string };
      };
    }>;
    changes?: Array<{
      field: string;
      value: Record<string, unknown>;
    }>;
  }>;
};

async function processPayload(payload: IGPayload) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  if (!payload.entry) return;

  for (const entry of payload.entry) {
    const igAccountId = entry.id;
    if (!igAccountId) continue;

    const { data: account } = await supabaseAdmin
      .from("instagram_accounts")
      .select("id")
      .eq("ig_user_id", igAccountId)
      .maybeSingle();
    if (!account) {
      console.warn(`[ig-webhook] conta ${igAccountId} não cadastrada`);
      continue;
    }

    // ============ DMs ============
    for (const msg of entry.messaging ?? []) {
      if (!msg.message || !msg.sender?.id) continue;
      const senderId = msg.sender.id;
      const isFromMe = senderId === igAccountId;
      const contactIgId = isFromMe ? msg.recipient?.id : senderId;
      if (!contactIgId) continue;

      const { data: conv } = await supabaseAdmin
        .from("instagram_conversations")
        .upsert(
          {
            account_id: account.id,
            contact_ig_id: contactIgId,
            last_message_at: new Date((msg.timestamp ?? Date.now())).toISOString(),
            last_message_preview: (msg.message.text ?? "[mídia]").slice(0, 140),
          },
          { onConflict: "account_id,contact_ig_id" },
        )
        .select("id, unread_count")
        .single();

      await supabaseAdmin.from("instagram_messages").insert({
        conversation_id: conv!.id,
        ig_message_id: msg.message.mid ?? null,
        direction: isFromMe ? "outbound" : "inbound",
        message_type: msg.message.attachments?.[0]?.type ?? "text",
        text: msg.message.text ?? null,
        attachment_url: msg.message.attachments?.[0]?.payload?.url ?? null,
        attachment_type: msg.message.attachments?.[0]?.type ?? null,
        reply_to_ig_message_id: msg.message.reply_to?.mid ?? null,
        is_deleted: msg.message.is_deleted ?? false,
        status: isFromMe ? "sent" : "received",
      });

      if (!isFromMe) {
        await supabaseAdmin
          .from("instagram_conversations")
          .update({ unread_count: (conv!.unread_count ?? 0) + 1 })
          .eq("id", conv!.id);
      }
    }

    // ============ Comentários / Mentions ============
    for (const change of entry.changes ?? []) {
      if (change.field !== "comments" && change.field !== "mentions") continue;
      const v = change.value as {
        id?: string;
        text?: string;
        from?: { id: string; username?: string };
        media?: { id?: string; media_product_type?: string };
        parent_id?: string;
      };
      if (!v.id || !v.media?.id) continue;

      await supabaseAdmin.from("instagram_comments").upsert(
        {
          account_id: account.id,
          media_id: v.media.id,
          comment_id: v.id,
          parent_comment_id: v.parent_id ?? null,
          from_ig_id: v.from?.id ?? null,
          from_username: v.from?.username ?? null,
          text: v.text ?? null,
        },
        { onConflict: "comment_id" },
      );
    }
  }
}
