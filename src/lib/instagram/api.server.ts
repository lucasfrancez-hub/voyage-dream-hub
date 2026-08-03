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

// Instagram API com Instagram Login → host graph.instagram.com.
// (graph.facebook.com só aceita tokens de Página/Facebook Login e devolve OAuth 190.)
const GRAPH = "https://graph.instagram.com/v21.0";

export type IGSendResult = { message_id?: string; recipient_id?: string; error?: string };

async function fetchGraph(path: string, init: RequestInit & { token: string }) {
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
  if (!res.ok) {
    console.error(`[ig-api] ${path} failed [${res.status}]: ${body}`);
    throw new Error(`Instagram Graph API ${res.status}: ${body}`);
  }
  try {
    return JSON.parse(body);
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
