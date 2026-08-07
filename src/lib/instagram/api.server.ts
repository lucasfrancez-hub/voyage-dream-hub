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

/** Apaga um comentário no Instagram (só funciona em comentários da própria conta ou em posts dela). */
export async function deleteComment(params: { commentId: string; token: string }) {
  return fetchGraph(`/${params.commentId}`, {
    method: "DELETE",
    token: params.token,
    operation: "delete_comment",
  });
}

/** Oculta/reexibe um comentário de terceiros na publicação. */
export async function setCommentHidden(params: { commentId: string; token: string; hide: boolean }) {
  return fetchGraph(`/${params.commentId}`, {
    method: "POST",
    token: params.token,
    operation: "hide_comment",
    body: JSON.stringify({ hide: params.hide }),
  });
}

/** Lê a contagem de curtidas de um comentário (e se nossa conta curtiu, quando o campo vem). */
export async function getCommentLikes(params: { commentId: string; token: string }): Promise<{
  like_count: number | null;
  user_has_liked: boolean | null;
}> {
  try {
    const r = await fetchGraph(`/${params.commentId}?fields=like_count`, {
      method: "GET",
      token: params.token,
      operation: "comment_likes",
    });
    return {
      like_count: typeof r.like_count === "number" ? r.like_count : null,
      user_has_liked: typeof r.user_has_liked === "boolean" ? r.user_has_liked : null,
    };
  } catch {
    return { like_count: null, user_has_liked: null };
  }
}

/** Curte/descurte um comentário como a conta da empresa. */
export async function setCommentLiked(params: { commentId: string; token: string; like: boolean }) {
  return fetchGraph(`/${params.commentId}/likes`, {
    method: params.like ? "POST" : "DELETE",
    token: params.token,
    operation: params.like ? "like_comment" : "unlike_comment",
  });
}

/** Apaga (unsend) uma mensagem enviada pela empresa — some para os dois lados. */
export async function unsendMessage(params: { igUserId: string; token: string; messageId: string }) {
  return fetchGraph(`/${params.igUserId}/messages`, {
    method: "DELETE",
    token: params.token,
    operation: "unsend_message",
    body: JSON.stringify({ message_id: params.messageId }),
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

/** Vídeo no Instagram é processado de forma assíncrona: espera o container ficar FINISHED. */
async function waitContainerReady(params: {
  containerId: string;
  token: string;
  timeoutMs?: number;
}): Promise<void> {
  const deadline = Date.now() + (params.timeoutMs ?? 5 * 60 * 1000);
  let lastStatus = "";
  while (Date.now() < deadline) {
    const r = await fetchGraph(`/${params.containerId}?fields=status_code,status`, {
      method: "GET",
      token: params.token,
      operation: "container_status",
    });
    lastStatus = String(r.status_code ?? "");
    if (lastStatus === "FINISHED") return;
    if (lastStatus === "ERROR" || lastStatus === "EXPIRED") {
      throw new Error(`Instagram não conseguiu processar o vídeo (${lastStatus}): ${r.status ?? ""}`);
    }
    await new Promise((res) => setTimeout(res, 5000));
  }
  throw new Error(`Tempo esgotado processando o vídeo (último status: ${lastStatus || "desconhecido"})`);
}

async function publishVideoContainer(params: {
  igUserId: string;
  token: string;
  fields: Record<string, unknown>;
}): Promise<PublishResult> {
  const container = await createMediaContainer({
    igUserId: params.igUserId,
    token: params.token,
    fields: params.fields,
  });
  await waitContainerReady({ containerId: container.id, token: params.token });
  const published = await publishContainer({
    igUserId: params.igUserId,
    token: params.token,
    containerId: container.id,
  });
  const permalink = await getPermalink({ mediaId: published.id, token: params.token });
  return { id: published.id, permalink, container_id: container.id };
}

/** Reels (aparece no feed + aba reels). */
export async function publishReelsVideo(params: {
  igUserId: string;
  token: string;
  videoUrl: string;
  caption?: string;
  coverUrl?: string;
  shareToFeed?: boolean;
}): Promise<PublishResult> {
  return publishVideoContainer({
    igUserId: params.igUserId,
    token: params.token,
    fields: {
      media_type: "REELS",
      video_url: params.videoUrl,
      caption: params.caption ?? "",
      share_to_feed: params.shareToFeed !== false,
      ...(params.coverUrl ? { cover_url: params.coverUrl } : {}),
    },
  });
}

/** Story em vídeo (até 60s). */
export async function publishStoryVideo(params: {
  igUserId: string;
  token: string;
  videoUrl: string;
}): Promise<PublishResult> {
  return publishVideoContainer({
    igUserId: params.igUserId,
    token: params.token,
    fields: { media_type: "STORIES", video_url: params.videoUrl },
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

/**
 * Métricas da publicação: curtidas/comentários (campos) + insights
 * (alcance, salvamentos, compartilhamentos, visualizações, interações).
 * Insights só existem para publicações da própria conta — quando a Meta
 * recusa, devolvemos apenas os contadores públicos.
 */
export async function fetchMediaStats(params: { mediaId: string; token: string }) {
  const base = await fetchGraph(
    `/${params.mediaId}?fields=id,media_type,media_product_type,permalink,timestamp,like_count,comments_count`,
    { method: "GET", token: params.token, operation: "media_stats" },
  );

  const produto = String(base.media_product_type ?? "").toUpperCase();
  const tipo = String(base.media_type ?? "").toUpperCase();
  const metricas =
    produto === "REELS" || tipo === "VIDEO"
      ? [
          "reach",
          "views",
          "likes",
          "comments",
          "saved",
          "shares",
          "total_interactions",
          "ig_reels_avg_watch_time",
          "ig_reels_video_view_total_time",
          "follows",
          "profile_visits",
        ]
      : ["reach", "views", "likes", "comments", "saved", "shares", "total_interactions", "profile_visits", "follows"];

  const basicas = ["reach", "views", "likes", "comments", "saved", "shares", "total_interactions"];
  let insights: Record<string, number> = {};
  let insightsErro: string | null = null;

  const buscar = async (lista: string[]) => {
    const json = await fetchGraph(`/${params.mediaId}/insights?metric=${lista.join(",")}`, {
      method: "GET",
      token: params.token,
      operation: "media_insights",
    });
    const linhas = (json.data as Array<{ name?: string; values?: Array<{ value?: number }> }> | undefined) ?? [];
    const out: Record<string, number> = {};
    for (const linha of linhas) {
      if (!linha.name) continue;
      out[linha.name] = Number(linha.values?.[0]?.value ?? 0);
    }
    return out;
  };

  try {
    insights = await buscar(metricas);
  } catch {
    // Alguma métrica opcional não é suportada nessa publicação: cai para o conjunto básico.
    try {
      insights = await buscar(basicas);
    } catch (e2) {
      insightsErro = e2 instanceof Error ? e2.message : "insights indisponíveis";
      insights = {};
    }
  }

  return {
    media_type: (base.media_type as string) ?? null,
    media_product_type: (base.media_product_type as string) ?? null,
    permalink: (base.permalink as string) ?? null,
    timestamp: (base.timestamp as string) ?? null,
    like_count: typeof base.like_count === "number" ? (base.like_count as number) : null,
    comments_count: typeof base.comments_count === "number" ? (base.comments_count as number) : null,
    insights,
    insights_error: insightsErro,
  };
}

// ============ Panorama de redes sociais (feed, reels e stories) ============

export type IGMediaResumo = {
  id: string;
  caption: string | null;
  media_type: string | null;
  media_product_type: string | null;
  permalink: string | null;
  thumbnail: string | null;
  timestamp: string | null;
  like_count: number | null;
  comments_count: number | null;
  is_story: boolean;
  insights: Record<string, number>;
};

const CAMPOS_MEDIA =
  "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count";

function normalizarMedia(item: Record<string, unknown>, isStory: boolean): IGMediaResumo {
  return {
    id: String(item.id),
    caption: (item.caption as string) ?? null,
    media_type: (item.media_type as string) ?? null,
    media_product_type: (item.media_product_type as string) ?? null,
    permalink: (item.permalink as string) ?? null,
    thumbnail: (item.thumbnail_url as string) ?? (item.media_url as string) ?? null,
    timestamp: (item.timestamp as string) ?? null,
    like_count: typeof item.like_count === "number" ? item.like_count : null,
    comments_count: typeof item.comments_count === "number" ? item.comments_count : null,
    is_story: isStory,
    insights: {},
  };
}

/** Últimas publicações do feed/reels da conta. */
export async function fetchAccountMedia(params: { igUserId: string; token: string; limit?: number }) {
  const json = await fetchGraph(
    `/${params.igUserId}/media?fields=${CAMPOS_MEDIA}&limit=${params.limit ?? 24}`,
    { method: "GET", token: params.token, operation: "account_media" },
  );
  const lista = (json.data as Array<Record<string, unknown>> | undefined) ?? [];
  return lista.map((m) => normalizarMedia(m, false));
}

/** Stories ativos (a Meta só devolve os das últimas 24h). */
export async function fetchAccountStories(params: { igUserId: string; token: string }) {
  try {
    const json = await fetchGraph(`/${params.igUserId}/stories?fields=${CAMPOS_MEDIA}`, {
      method: "GET",
      token: params.token,
      operation: "account_stories",
    });
    const lista = (json.data as Array<Record<string, unknown>> | undefined) ?? [];
    return lista.map((m) => normalizarMedia(m, true));
  } catch {
    return [] as IGMediaResumo[];
  }
}

/** Só os insights de uma mídia (sem repetir a leitura dos campos básicos). */
export async function fetchMediaInsightsOnly(params: {
  mediaId: string;
  token: string;
  isStory?: boolean;
  isVideo?: boolean;
}): Promise<Record<string, number>> {
  const conjuntos = params.isStory
    ? [["reach", "views", "replies", "total_interactions", "profile_visits", "follows"], ["reach", "views"]]
    : params.isVideo
      ? [
          ["reach", "views", "likes", "comments", "saved", "shares", "total_interactions", "ig_reels_avg_watch_time", "follows", "profile_visits"],
          ["reach", "views", "likes", "comments", "saved", "shares", "total_interactions"],
        ]
      : [
          ["reach", "views", "likes", "comments", "saved", "shares", "total_interactions", "profile_visits", "follows"],
          ["reach", "views", "likes", "comments", "saved", "shares", "total_interactions"],
        ];

  for (const lista of conjuntos) {
    try {
      const json = await fetchGraph(`/${params.mediaId}/insights?metric=${lista.join(",")}`, {
        method: "GET",
        token: params.token,
        operation: "media_insights",
      });
      const linhas = (json.data as Array<{ name?: string; values?: Array<{ value?: number }> }> | undefined) ?? [];
      const out: Record<string, number> = {};
      for (const linha of linhas) {
        if (!linha.name) continue;
        out[linha.name] = Number(linha.values?.[0]?.value ?? 0);
      }
      return out;
    } catch {
      // tenta o próximo conjunto de métricas
    }
  }
  return {};
}
