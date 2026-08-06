/**
 * Instagram Graph API helpers (server-only).
 *
 * Endpoints usados:
 *   - POST /{ig-user-id}/messages          → enviar DM
 *   - POST /{ig-user-id}/media             → criar container de mídia
 *   - POST /{ig-user-id}/media_publish     → publicar container
 *   - POST /{comment-id}/replies           → responder comentário público
 *   - GET  /me                             → refresh token check
 *
 * A conta Instagram Business precisa estar vinculada a uma Página do Facebook
 * e ter as permissões:
 *   instagram_business_basic
 *   instagram_business_manage_messages
 *   instagram_business_manage_comments
 *   instagram_business_content_publish
 */
import type { Json } from "@/integrations/supabase/types";

// Instagram API com Instagram Login → host graph.instagram.com.
// (graph.facebook.com só aceita tokens de Página/Facebook Login e devolve OAuth 190.)
const GRAPH = "https://graph.instagram.com/v21.0";

export type IGSendResult = { message_id?: string; recipient_id?: string; error?: string };

async function fetchGraph(path: string, init: RequestInit & { token: string; operation?: string }) {
  const started = Date.now();
  const { token, headers, ...rest } = init;
  const res = await fetch(`${GRAPH}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(headers ?? {}),
    },
  });
  const body = await res.text();
  let parsed: Record<string, unknown> | null = null;
  try { parsed = JSON.parse(body) as Record<string, unknown>; } catch { parsed = null; }
  const metaError = parsed?.error && typeof parsed.error === "object" ? parsed.error as { message?: string; code?: number; error_subcode?: number; fbtrace_id?: string } : null;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let requestPayload: unknown = null;
    if (typeof rest.body === "string") {
      try { requestPayload = JSON.parse(rest.body); } catch { requestPayload = rest.body; }
    }
    await supabaseAdmin.from("instagram_api_logs").insert({
      operation: init.operation ?? "graph_api",
      endpoint: path,
      method: rest.method ?? "GET",
      request_payload: requestPayload as Json | null,
      response_body: parsed as Json | null,
      response_raw: parsed ? null : body.slice(0, 20_000),
      http_status: res.status,
      success: res.ok,
      error_message: metaError?.message ?? (!res.ok ? body.slice(0, 2_000) : null),
      error_code: metaError?.code != null ? String(metaError.code) : null,
      error_subcode: metaError?.error_subcode != null ? String(metaError.error_subcode) : null,
      fbtrace_id: metaError?.fbtrace_id ?? null,
      duration_ms: Date.now() - started,
    });
  } catch (logError) {
    console.error("[ig-api] falha ao persistir log", logError);
  }
  if (!res.ok) {
    console.error(`[ig-api] ${path} failed [${res.status}]: ${body}`);
    throw new Error(`Instagram Graph API ${res.status}: ${body}`);
  }
  try {
    return parsed ?? JSON.parse(body);
  } catch {
    return { raw: body };
  }
}

// ============ Direct Messages ============

export async function sendDirectMessage(params: {
  igUserId: string;
  token: string;
  recipientIgId: string;
  text: string;
}): Promise<IGSendResult> {
  const body = {
    recipient: { id: params.recipientIgId },
    message: { text: params.text.slice(0, 1000) },
  };
  const json = await fetchGraph(`/${params.igUserId}/messages`, {
    method: "POST",
    token: params.token,
    operation: "send_dm",
    body: JSON.stringify(body),
  });
  return { message_id: json.message_id, recipient_id: json.recipient_id };
}

export async function sendDirectImage(params: {
  igUserId: string;
  token: string;
  recipientIgId: string;
  imageUrl: string;
}) {
  const body = {
    recipient: { id: params.recipientIgId },
    message: { attachment: { type: "image", payload: { url: params.imageUrl } } },
  };
  return fetchGraph(`/${params.igUserId}/messages`, {
    method: "POST",
    token: params.token,
    operation: "send_dm_image",
    body: JSON.stringify(body),
  });
}

// ============ Comments ============

export async function replyToComment(params: {
  commentId: string;
  token: string;
  message: string;
}) {
  return fetchGraph(`/${params.commentId}/replies`, {
    method: "POST",
    token: params.token,
    operation: "reply_comment",
    body: JSON.stringify({ message: params.message.slice(0, 500) }),
  });
}

export async function sendPrivateReplyToComment(params: {
  igUserId: string;
  token: string;
  commentId: string;
  text: string;
}) {
  const body = {
    recipient: { comment_id: params.commentId },
    message: { text: params.text.slice(0, 1000) },
  };
  return fetchGraph(`/${params.igUserId}/messages`, {
    method: "POST",
    token: params.token,
    operation: "private_reply_comment",
    body: JSON.stringify(body),
  });
}

// ============ Publishing ============

export type PublishResult = { id: string; permalink?: string; container_id?: string };

async function createMediaContainer(params: {
  igUserId: string;
  token: string;
  fields: Record<string, unknown>;
}): Promise<{ id: string }> {
  return fetchGraph(`/${params.igUserId}/media`, {
    method: "POST",
    token: params.token,
    body: JSON.stringify(params.fields),
  });
}

async function publishContainer(params: { igUserId: string; token: string; containerId: string }) {
  return fetchGraph(`/${params.igUserId}/media_publish`, {
    method: "POST",
    token: params.token,
    body: JSON.stringify({ creation_id: params.containerId }),
  });
}

async function getPermalink(params: { mediaId: string; token: string }): Promise<string | undefined> {
  try {
    const r = await fetchGraph(`/${params.mediaId}?fields=permalink`, {
      method: "GET",
      token: params.token,
    });
    return r.permalink;
  } catch {
    return undefined;
  }
}

export async function publishStoryImage(params: {
  igUserId: string;
  token: string;
  imageUrl: string;
}): Promise<PublishResult> {
  const container = await createMediaContainer({
    igUserId: params.igUserId,
    token: params.token,
    fields: { media_type: "STORIES", image_url: params.imageUrl },
  });
  const published = await publishContainer({
    igUserId: params.igUserId,
    token: params.token,
    containerId: container.id,
  });
  const permalink = await getPermalink({ mediaId: published.id, token: params.token });
  return { id: published.id, permalink, container_id: container.id };
}

export async function publishFeedImage(params: {
  igUserId: string;
  token: string;
  imageUrl: string;
  caption?: string;
}): Promise<PublishResult> {
  const container = await createMediaContainer({
    igUserId: params.igUserId,
    token: params.token,
    fields: { image_url: params.imageUrl, caption: params.caption ?? "" },
  });
  const published = await publishContainer({
    igUserId: params.igUserId,
    token: params.token,
    containerId: container.id,
  });
  const permalink = await getPermalink({ mediaId: published.id, token: params.token });
  return { id: published.id, permalink, container_id: container.id };
}

export async function publishFeedCarousel(params: {
  igUserId: string;
  token: string;
  imageUrls: string[];
  caption?: string;
}): Promise<PublishResult> {
  const children: string[] = [];
  for (const url of params.imageUrls.slice(0, 10)) {
    const c = await createMediaContainer({
      igUserId: params.igUserId,
      token: params.token,
      fields: { image_url: url, is_carousel_item: true },
    });
    children.push(c.id);
  }
  const container = await createMediaContainer({
    igUserId: params.igUserId,
    token: params.token,
    fields: { media_type: "CAROUSEL", children, caption: params.caption ?? "" },
  });
  const published = await publishContainer({
    igUserId: params.igUserId,
    token: params.token,
    containerId: container.id,
  });
  const permalink = await getPermalink({ mediaId: published.id, token: params.token });
  return { id: published.id, permalink, container_id: container.id };
}

// ============ Token refresh ============

export async function refreshLongLivedToken(params: { token: string; appId: string; appSecret: string }) {
  const url = `${GRAPH}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(params.token)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`refresh failed: ${res.status}`);
  return res.json() as Promise<{ access_token: string; token_type: string; expires_in: number }>;
}

// ============ Perfil do contato / mídia ============

/** Nome e @ do usuário que mandou a DM (Instagram Messaging user profile). */
export async function fetchContactProfile(params: { igUserId: string; token: string; contactIgId: string }) {
  const json = await fetchGraph(
    `/${params.contactIgId}?fields=name,username,profile_pic`,
    { method: "GET", token: params.token, operation: "contact_profile" },
  );
  return {
    name: (json.name as string) ?? null,
    username: (json.username as string) ?? null,
    profile_pic: (json.profile_pic as string) ?? null,
  };
}

/** Dados da publicação onde o comentário foi feito (pra IA e pro painel). */
export async function fetchMediaInfo(params: { mediaId: string; token: string }) {
  const json = await fetchGraph(
    `/${params.mediaId}?fields=caption,media_type,media_url,thumbnail_url,permalink,timestamp`,
    { method: "GET", token: params.token, operation: "media_info" },
  );
  return {
    caption: (json.caption as string) ?? null,
    media_type: (json.media_type as string) ?? null,
    permalink: (json.permalink as string) ?? null,
    thumbnail: (json.thumbnail_url as string) ?? (json.media_url as string) ?? null,
  };
}

/** Igual ao fetchMediaInfo, mas devolve também o arquivo (vídeo/imagem) pra tocar no painel. */
export async function fetchMediaDetails(params: { mediaId: string; token: string }) {
  const json = await fetchGraph(
    `/${params.mediaId}?fields=caption,media_type,media_url,thumbnail_url,permalink,timestamp`,
    { method: "GET", token: params.token, operation: "media_details" },
  );
  return {
    caption: (json.caption as string) ?? null,
    media_type: (json.media_type as string) ?? null,
    media_url: (json.media_url as string) ?? null,
    thumbnail: (json.thumbnail_url as string) ?? (json.media_url as string) ?? null,
    permalink: (json.permalink as string) ?? null,
  };
}


/** Anexo por URL (áudio, imagem, vídeo ou arquivo) numa DM. */
export async function sendDirectAttachment(params: {
  igUserId: string;
  token: string;
  recipientIgId: string;
  url: string;
  type: "image" | "audio" | "video" | "file";
}) {
  const body = {
    recipient: { id: params.recipientIgId },
    message: { attachment: { type: params.type, payload: { url: params.url } } },
  };
  return fetchGraph(`/${params.igUserId}/messages`, {
    method: "POST",
    token: params.token,
    operation: `send_dm_${params.type}`,
    body: JSON.stringify(body),
  });
}

/**
 * Publicações em que a conta foi MARCADA — inclui os posts em colaboração
 * (collab) publicados por outro perfil. A Meta NÃO manda webhook de comentário
 * pra quem é só coautor, então buscamos os comentários por aqui.
 */
export async function fetchTaggedMediaWithComments(params: {
  igUserId: string;
  token: string;
  mediaLimit?: number;
  commentLimit?: number;
}) {
  const fields = [
    "id",
    "permalink",
    "caption",
    "media_type",
    "thumbnail_url",
    "media_url",
    "timestamp",
    "comments_count",
    `comments.limit(${params.commentLimit ?? 30}){id,text,timestamp,username,parent_id}`,
  ].join(",");
  const json = await fetchGraph(
    `/${params.igUserId}/tags?fields=${encodeURIComponent(fields)}&limit=${params.mediaLimit ?? 8}`,
    { method: "GET", token: params.token, operation: "tagged_media_comments" },
  );
  const data = (json.data as Array<Record<string, unknown>>) ?? [];
  return data.map((m) => ({
    mediaId: String(m.id ?? ""),
    permalink: (m.permalink as string) ?? null,
    caption: (m.caption as string) ?? null,
    mediaType: (m.media_type as string) ?? null,
    mediaUrl: (m.media_url as string) ?? null,
    thumbnail: (m.thumbnail_url as string) ?? (m.media_url as string) ?? null,

    comments: (((m.comments as { data?: Array<Record<string, unknown>> })?.data) ?? []).map((c) => ({
      id: String(c.id ?? ""),
      text: (c.text as string) ?? null,
      timestamp: (c.timestamp as string) ?? null,
      username: (c.username as string) ?? null,
      parentId: (c.parent_id as string) ?? null,
    })),
  }));
}
