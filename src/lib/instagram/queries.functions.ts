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
    const rows = data ?? [];
    // @username da conta que recebeu a DM (identifica @viaairs x @lucasfrancez na lista)
    const { data: contas } = await context.supabase.from("instagram_accounts").select("id, username");
    const nomes = new Map((contas ?? []).map((a) => [a.id as string, (a.username as string | null) ?? null]));
    return rows.map((r) => ({ ...r, account_username: nomes.get(r.account_id) ?? null }));
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
      .select("id, direction, message_type, text, attachment_url, sent_by_agent_slug, status, is_deleted, created_at, delivered_at, read_at")
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

    const { sendInstagramMediaSmart } = await import("./send-media.server");
    const res = await sendInstagramMediaSmart({
      igUserId: (account.ig_user_id ?? account.page_id) as string,
      token: account.access_token as string,
      recipientIgId: conv.contact_ig_id,
      url,
      mime: data.mime,
      filename: data.filename,
    });

    await supabaseAdmin.from("instagram_messages").insert({
      conversation_id: conv.id,
      ig_message_id: res.message_id ?? null,
      direction: "outbound",
      message_type: tipo,
      attachment_url: url,
      attachment_type: tipo,
      status: res.message_id ? "sent" : "failed",
      ...(res.delivered_as === "link" ? { text: url } : {}),
    });

    if (!res.message_id) throw new Error(res.error ?? "O Instagram não confirmou o envio da mídia");


    return { ok: true, url, type: tipo };
  });


// ============ Comentários ============

export const listInstagramComments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("instagram_comments")
      .select("id, account_id, media_id, media_permalink, media_caption, media_thumbnail, media_type, comment_id, from_username, text, auto_reply_status, auto_reply_text, auto_replied_at, auto_dm_sent_at, created_at")
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
      .select("id, account_id, comment_id, metadata")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !row) throw new Error("Comentário não encontrado");
    const meta = (row.metadata ?? {}) as { collab?: boolean };
    const { autoReplyComment } = await import("./send.server");
    await autoReplyComment({
      accountId: row.account_id,
      commentId: row.comment_id,
      publicReply: data.public_reply,
      privateDm: data.private_dm ?? null,
      collab: meta.collab === true,
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

/**
 * Publica direto no Instagram uma arte gerada no navegador (Feed 3:4 ou Story 9:16).
 * A imagem chega em base64, é guardada no storage e o link é enviado à API do Instagram.
 */
export const publishPackageArtToInstagram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    media_type: "story_image" | "feed_image";
    image_base64: string;
    caption?: string;
    package_id?: string;
    account_id?: string;
    slug?: string;
  }) =>
    z.object({
      media_type: z.enum(["story_image", "feed_image"]),
      image_base64: z.string().min(100),
      caption: z.string().max(2200).optional(),
      package_id: z.string().uuid().optional(),
      account_id: z.string().uuid().optional(),
      slug: z.string().max(120).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let accountId = data.account_id;
    if (!accountId) {
      const { data: acc } = await supabaseAdmin
        .from("instagram_accounts")
        .select("id")
        .eq("active", true)
        .order("is_default", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!acc?.id) throw new Error("Nenhuma conta do Instagram conectada");
      accountId = acc.id as string;
    }

    const binary = atob(data.image_base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);

    const path = `instagram-posts/${Date.now()}-${data.slug ?? "arte"}-${data.media_type}.png`;
    const up = await supabaseAdmin.storage
      .from("chat-media")
      .upload(path, bytes, { contentType: "image/png", upsert: true });
    if (up.error) throw new Error(`Falha ao guardar a arte: ${up.error.message}`);

    const signed = await supabaseAdmin.storage
      .from("chat-media")
      .createSignedUrl(path, 60 * 60 * 24 * 7);
    const url = signed.data?.signedUrl;
    if (!url) throw new Error("Não consegui gerar o link da arte");

    const { publishInstagramMedia } = await import("./publish.server");
    return await publishInstagramMedia({
      accountId,
      mediaType: data.media_type,
      imageUrls: [url],
      caption: data.media_type === "feed_image" ? data.caption : undefined,
      packageId: data.package_id ?? null,
      createdBy: context.userId,
    });
  });


/** Rebusca nome, @ e foto do contato de uma DM (usado quando o perfil veio vazio). */
export const refreshInstagramProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { conversation_id: string; force?: boolean }) =>
    z.object({ conversation_id: z.string().uuid(), force: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: conv, error } = await context.supabase
      .from("instagram_conversations")
      .select("id, account_id, contact_ig_id")
      .eq("id", data.conversation_id)
      .maybeSingle();
    if (error || !conv) throw new Error("Conversa não encontrada");
    const { ensureInstagramContactProfile } = await import("./profile.server");
    return ensureInstagramContactProfile({
      conversationId: conv.id,
      accountRowId: conv.account_id,
      contactIgId: conv.contact_ig_id,
      force: data.force,
    });
  });

/** Comentários agrupados por publicação — cada post vira uma "conversa". */
export const listInstagramCommentThreads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("instagram_comments")
      .select("id, account_id, media_id, media_permalink, media_caption, media_thumbnail, media_type, comment_id, parent_comment_id, from_ig_id, from_username, from_profile_pic, text, auto_reply_status, auto_reply_text, auto_replied_at, auto_dm_sent_at, read_at, created_at, metadata")
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);

    const rows = data ?? [];
    const { data: contas } = await context.supabase.from("instagram_accounts").select("id, username");
    const nomesConta = new Map((contas ?? []).map((a) => [a.id as string, (a.username as string | null) ?? null]));

    // Foto de quem comentou: usa a que já temos guardada, senão puxa da DM do mesmo perfil.
    const semFoto = [...new Set(rows.filter((c) => !c.from_profile_pic && c.from_ig_id).map((c) => c.from_ig_id as string))];
    const fotos = new Map<string, string>();
    if (semFoto.length > 0) {
      const { data: convs } = await context.supabase
        .from("instagram_conversations")
        .select("contact_ig_id, contact_profile_pic")
        .in("contact_ig_id", semFoto);
      for (const c of convs ?? []) {
        if (c.contact_profile_pic) fotos.set(c.contact_ig_id as string, c.contact_profile_pic as string);
      }
    }

    type Comentario = (typeof rows)[number] & { from_profile_pic: string | null };
    const threads = new Map<string, {
      media_id: string;
      media_permalink: string | null;
      media_caption: string | null;
      media_thumbnail: string | null;
      media_type: string | null;
      account_username: string | null;
      collab: boolean;
      last_at: string | null;
      total: number;
      pendentes: number;
      comments: Comentario[];
    }>();

    for (const raw of rows) {
      const c: Comentario = {
        ...raw,
        from_profile_pic: raw.from_profile_pic ?? (raw.from_ig_id ? (fotos.get(raw.from_ig_id) ?? null) : null),
      };
      const key = c.media_id ?? "sem-publicacao";
      const t = threads.get(key) ?? {
        media_id: key,
        media_permalink: null,
        media_caption: null,
        media_thumbnail: null,
        media_type: null,
        account_username: null,
        collab: false,
        last_at: null,
        total: 0,
        pendentes: 0,
        comments: [] as Comentario[],
      };
      t.media_permalink = c.media_permalink ?? t.media_permalink;
      t.media_caption = c.media_caption ?? t.media_caption;
      t.media_thumbnail = c.media_thumbnail ?? t.media_thumbnail;
      t.media_type = c.media_type ?? t.media_type;
      t.account_username = nomesConta.get(c.account_id as string) ?? t.account_username;
      // Publicação em colaboração: veio da varredura de posts marcados.
      if ((c.metadata as { collab?: boolean } | null)?.collab) t.collab = true;
      t.last_at = c.created_at ?? t.last_at;
      t.total += 1;
      if (!c.read_at && !c.auto_replied_at && !c.auto_dm_sent_at) t.pendentes += 1;
      t.comments.push(c);
      threads.set(key, t);
    }


    return [...threads.values()].sort((a, b) => (b.last_at ?? "").localeCompare(a.last_at ?? ""));
  });

/** Marca todos os comentários de uma publicação como lidos (some o badge). */
export const markInstagramCommentThreadRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { media_id: string }) => z.object({ media_id: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("instagram_comments")
      .update({ read_at: new Date().toISOString() })
      .eq("media_id", data.media_id)
      .is("read_at", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Dados da publicação (inclusive o link do vídeo) direto da API do Instagram. */
export const getInstagramMediaDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { media_id: string }) => z.object({ media_id: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    // A publicação pode ser de qualquer conta conectada (ou de um collab).
    // Descobre a conta pelo comentário salvo e, se não der, tenta todas.
    const { data: comentario } = await context.supabase
      .from("instagram_comments")
      .select("account_id")
      .eq("media_id", data.media_id)
      .limit(1)
      .maybeSingle();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: contas } = await supabaseAdmin
      .from("instagram_accounts")
      .select("id, access_token, is_default")
      .order("is_default", { ascending: false });

    const lista = (contas ?? []) as Array<{ id: string; access_token: string | null }>;
    if (lista.length === 0) throw new Error("Nenhuma conta do Instagram conectada");
    const preferida = comentario?.account_id;
    const ordenadas = [
      ...lista.filter((c) => c.id === preferida),
      ...lista.filter((c) => c.id !== preferida),
    ].filter((c) => c.access_token);

    const { fetchMediaDetails } = await import("./api.server");
    let ultimoErro: unknown = null;
    for (const conta of ordenadas) {
      try {
        return await fetchMediaDetails({ mediaId: data.media_id, token: conta.access_token as string });
      } catch (e) {
        ultimoErro = e;
      }
    }
    throw new Error(
      ultimoErro instanceof Error ? ultimoErro.message : "Publicação indisponível na API do Instagram",
    );
  });

/** Apaga o histórico de comentários de uma publicação (não remove nada no Instagram). */
export const deleteInstagramCommentThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { media_id: string }) => z.object({ media_id: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("instagram_comments")
      .delete()
      .eq("media_id", data.media_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Apaga um comentário.
 * escopo "instagram" → apaga também na publicação (reflete pra todo mundo).
 * escopo "local"     → some só do nosso inbox.
 */
export const deleteInstagramComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; escopo?: "instagram" | "local" }) =>
    z.object({ id: z.string().uuid(), escopo: z.enum(["instagram", "local"]).default("instagram") }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("instagram_comments")
      .select("id, account_id, comment_id")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !row) throw new Error("Comentário não encontrado");

    let avisoInstagram: string | null = null;
    let ocultado = false;
    if (data.escopo === "instagram") {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      // tenta com o token da conta do comentário e, se falhar, com as demais contas
      // conectadas (posts em collab pertencem à outra conta).
      const { data: contas } = await supabaseAdmin
        .from("instagram_accounts")
        .select("id, access_token");
      const tokens = (contas ?? [])
        .sort((a, b) => (a.id === row.account_id ? -1 : b.id === row.account_id ? 1 : 0))
        .map((c) => c.access_token as string | null)
        .filter((t): t is string => !!t);
      if (!tokens.length) throw new Error("Conta do Instagram sem token");

      const { deleteComment, setCommentHidden } = await import("./api.server");
      let apagou = false;
      let ultimoErro: unknown = null;
      for (const token of tokens) {
        try {
          await deleteComment({ commentId: row.comment_id, token });
          apagou = true;
          break;
        } catch (e) {
          ultimoErro = e;
        }
      }

      if (!apagou) {
        // Fallback: comentário de terceiros — o Instagram só permite ocultar.
        for (const token of tokens) {
          try {
            await setCommentHidden({ commentId: row.comment_id, token, hide: true });
            ocultado = true;
            break;
          } catch (e) {
            ultimoErro = e;
          }
        }
        avisoInstagram = ocultado
          ? "O Instagram não deixa apagar comentário de outra pessoa. Ele foi ocultado na publicação (ninguém mais vê) e continua aqui como oculto."
          : ultimoErro instanceof Error
            ? ultimoErro.message
            : "Falha ao apagar no Instagram";
      }
    }

    if (ocultado) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: atual } = await supabaseAdmin
        .from("instagram_comments")
        .select("metadata")
        .eq("id", row.id)
        .maybeSingle();
      const meta = { ...((atual?.metadata ?? {}) as Record<string, unknown>), hidden: true };
      await supabaseAdmin.from("instagram_comments").update({ metadata: meta }).eq("id", row.id);
      return { ok: true, aviso: avisoInstagram, hidden: true };
    }

    const { error: delErr } = await context.supabase.from("instagram_comments").delete().eq("id", data.id);
    if (delErr) throw new Error(delErr.message);
    return { ok: true, aviso: avisoInstagram, hidden: false };
  });

/** Oculta ou reexibe um comentário na publicação do Instagram. */
export const setInstagramCommentHidden = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; hidden: boolean }) =>
    z.object({ id: z.string().uuid(), hidden: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("instagram_comments")
      .select("id, account_id, comment_id, metadata")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !row) throw new Error("Comentário não encontrado");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: conta } = await supabaseAdmin
      .from("instagram_accounts")
      .select("access_token")
      .eq("id", row.account_id)
      .maybeSingle();
    if (!conta?.access_token) throw new Error("Conta do Instagram sem token");

    const { setCommentHidden } = await import("./api.server");
    await setCommentHidden({ commentId: row.comment_id, token: conta.access_token as string, hide: data.hidden });

    const meta = { ...((row.metadata ?? {}) as Record<string, unknown>), hidden: data.hidden };
    await supabaseAdmin.from("instagram_comments").update({ metadata: meta }).eq("id", row.id);
    return { ok: true, hidden: data.hidden };
  });

/** Atualiza a contagem de curtidas dos comentários de uma publicação. */
export const syncInstagramCommentLikes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { media_id: string }) => z.object({ media_id: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("instagram_comments")
      .select("id, account_id, comment_id, metadata")
      .eq("media_id", data.media_id)
      .limit(80);
    if (!rows?.length) return { ok: true, atualizados: 0 };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getCommentLikes } = await import("./api.server");
    const contas = new Map<string, string>();
    let atualizados = 0;

    for (const row of rows) {
      let token = contas.get(row.account_id as string);
      if (!token) {
        const { data: conta } = await supabaseAdmin
          .from("instagram_accounts")
          .select("access_token")
          .eq("id", row.account_id)
          .maybeSingle();
        if (!conta?.access_token) continue;
        token = conta.access_token as string;
        contas.set(row.account_id as string, token);
      }
      const { like_count, user_has_liked } = await getCommentLikes({ commentId: row.comment_id, token });
      if (like_count == null && user_has_liked == null) continue;
      const meta = { ...((row.metadata ?? {}) as Record<string, unknown>) };
      if (like_count != null) meta.like_count = like_count;
      if (user_has_liked != null) meta.liked = user_has_liked;
      await supabaseAdmin.from("instagram_comments").update({ metadata: meta as never }).eq("id", row.id);
      atualizados += 1;
    }
    return { ok: true, atualizados };
  });

/** Curte ou descurte um comentário no Instagram. */
export const toggleInstagramCommentLike = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; like: boolean }) =>
    z.object({ id: z.string().uuid(), like: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("instagram_comments")
      .select("id, account_id, comment_id, metadata")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !row) throw new Error("Comentário não encontrado");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: contas } = await supabaseAdmin
      .from("instagram_accounts")
      .select("id, access_token");
    const tokens = (contas ?? [])
      .filter((c) => !!c.access_token)
      .sort((a, b) => (a.id === row.account_id ? -1 : b.id === row.account_id ? 1 : 0))
      .map((c) => c.access_token as string);
    if (!tokens.length) throw new Error("Conta do Instagram sem token");

    const { setCommentLiked, getCommentLikes } = await import("./api.server");
    let tokenOk: string | null = null;
    let ultimoErro: unknown = null;
    for (const token of tokens) {
      try {
        await setCommentLiked({ commentId: row.comment_id, token, like: data.like });
        tokenOk = token;
        break;
      } catch (e) {
        ultimoErro = e;
      }
    }
    if (!tokenOk) {
      throw new Error(
        ultimoErro instanceof Error && /\b(400|403|404)\b/.test(ultimoErro.message)
          ? "O Instagram permite consultar as curtidas, mas a API oficial não permite curtir comentários — inclusive em publicações da própria conta."
          : ultimoErro instanceof Error
            ? ultimoErro.message
            : "Falha ao curtir no Instagram",
      );
    }

    const atual = await getCommentLikes({ commentId: row.comment_id, token: tokenOk });
    const meta: Record<string, unknown> = { ...((row.metadata ?? {}) as Record<string, unknown>), liked: data.like };
    if (atual.like_count != null) meta.like_count = atual.like_count;
    await supabaseAdmin.from("instagram_comments").update({ metadata: meta as never }).eq("id", row.id);
    return { ok: true, liked: data.like, like_count: atual.like_count };

  });



/**
 * Apaga uma mensagem da DM.
 * escopo "todos" → unsend no Instagram (some pros dois lados; só mensagens enviadas por nós).
 * escopo "aqui"  → some só do nosso inbox.
 */
export const deleteInstagramMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; escopo?: "todos" | "aqui" }) =>
    z.object({ id: z.string().uuid(), escopo: z.enum(["todos", "aqui"]).default("aqui") }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: msg, error } = await context.supabase
      .from("instagram_messages")
      .select("id, conversation_id, direction, ig_message_id")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !msg) throw new Error("Mensagem não encontrada");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let aviso: string | null = null;

    if (data.escopo === "todos") {
      if (msg.direction !== "outbound" || !msg.ig_message_id) {
        aviso = "O Instagram só deixa apagar para todos as mensagens enviadas por nós. Apagada apenas aqui.";
      } else {
        const { data: conv } = await supabaseAdmin
          .from("instagram_conversations")
          .select("account_id")
          .eq("id", msg.conversation_id)
          .maybeSingle();
        const { data: conta } = conv
          ? await supabaseAdmin
              .from("instagram_accounts")
              .select("ig_user_id, page_id, access_token")
              .eq("id", conv.account_id)
              .maybeSingle()
          : { data: null };
        if (!conta?.access_token) throw new Error("Conta do Instagram sem token");
        const { unsendMessage } = await import("./api.server");
        try {
          await unsendMessage({
            igUserId: (conta.ig_user_id ?? conta.page_id) as string,
            token: conta.access_token as string,
            messageId: msg.ig_message_id,
          });
        } catch (e) {
          aviso =
            e instanceof Error
              ? `O Instagram não apagou lá (${e.message.slice(0, 160)}). Apagada apenas aqui.`
              : "Falha ao apagar no Instagram. Apagada apenas aqui.";
        }
      }
    }

    const { error: updErr } = await supabaseAdmin
      .from("instagram_messages")
      .update({ is_deleted: true, text: null, attachment_url: null })
      .eq("id", msg.id);
    if (updErr) throw new Error(updErr.message);
    return { ok: true, aviso };
  });


/** Curtidas e insights (alcance, salvos, compartilhamentos…) de uma publicação. */
export const getInstagramMediaStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { media_id: string }) => z.object({ media_id: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: comentario } = await context.supabase
      .from("instagram_comments")
      .select("account_id")
      .eq("media_id", data.media_id)
      .limit(1)
      .maybeSingle();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: contas } = await supabaseAdmin
      .from("instagram_accounts")
      .select("id, access_token, is_default")
      .order("is_default", { ascending: false });

    const lista = ((contas ?? []) as Array<{ id: string; access_token: string | null }>).filter(
      (c) => c.access_token,
    );
    if (lista.length === 0) throw new Error("Nenhuma conta do Instagram conectada");
    const preferida = comentario?.account_id;
    const ordenadas = [
      ...lista.filter((c) => c.id === preferida),
      ...lista.filter((c) => c.id !== preferida),
    ];

    const { fetchMediaStats } = await import("./api.server");
    let melhor: Awaited<ReturnType<typeof fetchMediaStats>> | null = null;
    let ultimoErro: unknown = null;
    for (const conta of ordenadas) {
      try {
        const r = await fetchMediaStats({ mediaId: data.media_id, token: conta.access_token as string });
        // Se a conta trouxe insights, é a dona da publicação — para por aqui.
        if (Object.keys(r.insights).length > 0) return r;
        melhor = melhor ?? r;
      } catch (e) {
        ultimoErro = e;
      }
    }
    if (melhor) return melhor;
    throw new Error(
      ultimoErro instanceof Error ? ultimoErro.message : "Não foi possível ler as métricas da publicação",
    );
  });
