import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// ============ Contas ============

export const listInstagramAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("instagram_accounts")
      .select("id, ig_user_id, username, display_name, profile_picture_url, is_default, active, token_expires_at, created_at")
      .order("is_default", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertInstagramAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id?: string;
    ig_user_id: string;
    page_id: string;
    username: string;
    display_name?: string;
    access_token?: string;
    is_default?: boolean;
  }) => d)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Apenas admins podem gerenciar contas Instagram");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.is_default) {
      await supabaseAdmin.from("instagram_accounts").update({ is_default: false }).neq("id", data.id ?? "00000000-0000-0000-0000-000000000000");
    }

    const payload = {
      ig_user_id: data.ig_user_id,
      page_id: data.page_id,
      username: data.username,
      display_name: data.display_name ?? null,
      is_default: data.is_default ?? false,
      ...(data.access_token ? { access_token: data.access_token, token_expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString() } : {}),
    };

    if (data.id) {
      const { error } = await supabaseAdmin.from("instagram_accounts").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabaseAdmin.from("instagram_accounts").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row!.id };
  });

export const getInstagramDiagnostics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Apenas admins podem consultar o diagnóstico do Instagram");
    const diagnostics = await import("./diagnostics.server");
    return diagnostics.getInstagramDiagnostics();
  });

export const testInstagramConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { account_id?: string }) => z.object({ account_id: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Apenas admins podem testar o Instagram");
    const diagnostics = await import("./diagnostics.server");
    return diagnostics.runInstagramHealthCheck(data.account_id);
  });

// ============ Conversas / DMs ============

export const listInstagramConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("instagram_conversations")
      .select("id, account_id, contact_ig_id, contact_username, contact_name, contact_profile_pic, last_message_at, last_message_preview, unread_count, status, funnel_stage, assigned_to, assigned_agent_slug")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const markInstagramConversationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { conversation_id: string }) => z.object({ conversation_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("instagram_conversations")
      .update({ unread_count: 0 })
      .eq("id", data.conversation_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });



export const listInstagramMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { conversation_id: string }) => z.object({ conversation_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("instagram_messages")
      .select("id, direction, message_type, text, attachment_url, sent_by_agent_slug, status, is_deleted, created_at")
      .eq("conversation_id", data.conversation_id)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const sendInstagramReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { conversation_id: string; text: string }) =>
    z.object({ conversation_id: z.string().uuid(), text: z.string().min(1).max(1000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: conv, error } = await context.supabase
      .from("instagram_conversations")
      .select("id, account_id, contact_ig_id")
      .eq("id", data.conversation_id)
      .maybeSingle();
    if (error || !conv) throw new Error("Conversa não encontrada");

    const { sendInstagramDM } = await import("./send.server");
    await sendInstagramDM({
      conversationId: conv.id,
      accountId: conv.account_id,
      recipientIgId: conv.contact_ig_id,
      text: data.text,
      sentBy: context.userId,
    });
    return { ok: true };
  });

/** Envia mídia (imagem, áudio, vídeo ou arquivo) numa DM do Instagram. */
export const sendInstagramAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { conversation_id: string; file_base64: string; mime: string; filename: string }) =>
    z
      .object({
        conversation_id: z.string().uuid(),
        file_base64: z.string().min(10),
        mime: z.string().min(3),
        filename: z.string().min(1).max(180),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: conv, error } = await context.supabase
      .from("instagram_conversations")
      .select("id, account_id, contact_ig_id")
      .eq("id", data.conversation_id)
      .maybeSingle();
    if (error || !conv) throw new Error("Conversa não encontrada");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const bytes = Uint8Array.from(atob(data.file_base64), (c) => c.charCodeAt(0));
    const path = `instagram/${conv.id}/${Date.now()}-${data.filename.replace(/[^\w.-]/g, "_")}`;
    const up = await supabaseAdmin.storage
      .from("chat-media")
      .upload(path, bytes, { contentType: data.mime, upsert: true });
    if (up.error) throw new Error(`Falha ao guardar a mídia: ${up.error.message}`);
    const signed = await supabaseAdmin.storage.from("chat-media").createSignedUrl(path, 60 * 60 * 24 * 7);
    const url = signed.data?.signedUrl;
    if (!url) throw new Error("Não consegui gerar o link da mídia");

    const tipo: "image" | "audio" | "video" | "file" = data.mime.startsWith("image/")
      ? "image"
      : data.mime.startsWith("audio/")
        ? "audio"
        : data.mime.startsWith("video/")
          ? "video"
          : "file";

    const { data: account } = await supabaseAdmin
      .from("instagram_accounts")
      .select("ig_user_id, page_id, access_token")
      .eq("id", conv.account_id)
      .maybeSingle();
    if (!account?.access_token) throw new Error("Conta do Instagram sem token");

    const { sendDirectAttachment } = await import("./api.server");
    const res = (await sendDirectAttachment({
      igUserId: (account.ig_user_id ?? account.page_id) as string,
      token: account.access_token as string,
      recipientIgId: conv.contact_ig_id,
      url,
      type: tipo,
    })) as { message_id?: string };

    await supabaseAdmin.from("instagram_messages").insert({
      conversation_id: conv.id,
      ig_message_id: res.message_id ?? null,
      direction: "outbound",
      message_type: tipo,
      attachment_url: url,
      attachment_type: tipo,
      status: "sent",
    });

    return { ok: true, url, type: tipo };
  });


// ============ Comentários ============

export const listInstagramComments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("instagram_comments")
      .select("id, media_id, media_permalink, media_caption, media_thumbnail, media_type, comment_id, from_username, text, auto_reply_status, auto_reply_text, auto_replied_at, auto_dm_sent_at, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const triggerAutoReplyComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; public_reply: string; private_dm?: string }) =>
    z.object({ id: z.string().uuid(), public_reply: z.string().min(1), private_dm: z.string().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("instagram_comments")
      .select("id, account_id, comment_id")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !row) throw new Error("Comentário não encontrado");
    const { autoReplyComment } = await import("./send.server");
    await autoReplyComment({
      accountId: row.account_id,
      commentId: row.comment_id,
      publicReply: data.public_reply,
      privateDm: data.private_dm ?? null,
    });
    return { ok: true };
  });

// ============ Publicações ============

export const listInstagramMedia = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("instagram_media")
      .select("id, media_type, caption, image_urls, status, permalink, published_at, scheduled_for, created_by_name, error, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const publishToInstagram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    account_id: string;
    media_type: "story_image" | "feed_image" | "carousel";
    image_urls: string[];
    caption?: string;
    package_id?: string;
  }) =>
    z.object({
      account_id: z.string().uuid(),
      media_type: z.enum(["story_image", "feed_image", "carousel"]),
      image_urls: z.array(z.string().url()).min(1).max(10),
      caption: z.string().max(2200).optional(),
      package_id: z.string().uuid().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { publishInstagramMedia } = await import("./publish.server");
    const result = await publishInstagramMedia({
      accountId: data.account_id,
      mediaType: data.media_type,
      imageUrls: data.image_urls,
      caption: data.caption,
      packageId: data.package_id ?? null,
      createdBy: context.userId,
    });
    return result;
  });
