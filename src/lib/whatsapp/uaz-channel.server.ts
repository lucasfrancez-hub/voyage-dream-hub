/**
 * uazChannelService — canal WhatsApp do CHATBOT via UazAPI.
 *
 * A partir da migração do canal, o atendimento individual (recebimento,
 * respostas, mídias e "digitando…") passa a poder usar a UazAPI, mantendo a
 * Meta Cloud API como alternativa configurável (`wa_ai_switch.wa_provider`).
 *
 * SERVER-ONLY — nunca importar de rotas/componentes de cliente.
 */

const CACHE_MS = 5_000;
let providerCache: { value: "meta" | "uaz"; at: number } | null = null;

/** Canal ativo do chatbot. Padrão: 'meta'. */
export async function currentWhatsAppProvider(): Promise<"meta" | "uaz"> {
  if (providerCache && Date.now() - providerCache.at < CACHE_MS) return providerCache.value;
  let value: "meta" | "uaz" = (process.env.WHATSAPP_PROVIDER as "meta" | "uaz") ?? "meta";
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("wa_ai_switch")
      .select("wa_provider")
      .eq("id", "global")
      .maybeSingle();
    const db = (data as { wa_provider?: string | null } | null)?.wa_provider;
    if (db === "uaz" || db === "meta") value = db;
  } catch {
    /* mantém o valor do env */
  }
  providerCache = { value, at: Date.now() };
  return value;
}

export function resetWhatsAppProviderCache(): void {
  providerCache = null;
}

/** true quando o chatbot está operando pela UazAPI. */
export async function isUazChannel(): Promise<boolean> {
  return (await currentWhatsAppProvider()) === "uaz";
}

function uazBase(): string {
  return (process.env.UAZAPI_URL ?? "").replace(/\/+$/, "");
}

function uazToken(): string {
  return process.env.UAZAPI_TOKEN ?? "";
}

export function uazConfigured(): boolean {
  return Boolean(uazBase() && uazToken());
}

async function uazRequest(path: string, body: Record<string, unknown>): Promise<unknown> {
  if (!uazConfigured()) throw new Error("UazAPI não configurada");
  const res = await fetch(`${uazBase()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", token: uazToken() },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`UazAPI ${path} ${res.status}: ${raw.slice(0, 200)}`);
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function pick<T = unknown>(obj: unknown, ...keys: string[]): T | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const o = obj as Record<string, unknown>;
  for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== "") return o[k] as T;
  return undefined;
}

/** Número no formato aceito pela UazAPI (só dígitos, com DDI). */
export function uazNumber(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) return "55" + digits;
  return digits;
}

/** Telefone interno (wa_phone) a partir do chatid/jid da UazAPI. */
export function phoneFromChatId(chatid: string): string | null {
  const id = String(chatid ?? "");
  if (!id || id.includes("@g.us") || id.includes("@newsletter") || id.includes("@broadcast")) return null;
  const digits = id.split("@")[0].split(":")[0].replace(/\D/g, "");
  return digits.length >= 10 ? digits : null;
}

// ================== Envio ==================

type SendResult = { id: string | null; error?: string };

function extractId(res: unknown): string | null {
  const direct = pick<string>(res, "id", "messageid", "messageId", "key");
  if (typeof direct === "string") return direct;
  const nested = pick<Record<string, unknown>>(res, "message", "response", "data");
  if (nested) {
    const inner = pick<string>(nested, "id", "messageid", "messageId");
    if (typeof inner === "string") return inner;
    const key = pick<Record<string, unknown>>(nested, "key");
    const keyId = pick<string>(key, "id");
    if (typeof keyId === "string") return keyId;
  }
  return null;
}

export async function uazSendText(to: string, body: string, replyId?: string | null): Promise<SendResult> {
  try {
    const res = await uazRequest("/send/text", {
      number: uazNumber(to),
      text: body.slice(0, 4090),
      ...(replyId ? { replyid: replyId } : {}),
      readchat: true,
    });
    return { id: extractId(res) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[whatsapp/uaz send] falhou:", msg);
    return { id: null, error: msg };
  }
}

export async function uazSendMediaUrl(
  to: string,
  kind: "image" | "video" | "audio" | "document",
  url: string,
  caption?: string | null,
  filename?: string | null,
): Promise<SendResult> {
  try {
    const res = await uazRequest("/send/media", {
      number: uazNumber(to),
      type: kind === "audio" ? "ptt" : kind,
      file: url,
      ...(caption ? { text: caption } : {}),
      ...(filename ? { docName: filename } : {}),
    });
    return { id: extractId(res) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[whatsapp/uaz media] falhou:", msg);
    return { id: null, error: msg };
  }
}

export async function uazSendMediaBytes(
  to: string,
  kind: "image" | "video" | "audio" | "document",
  bytes: Uint8Array,
  mimeType: string,
  filename: string,
  caption?: string | null,
): Promise<SendResult> {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const dataUrl = `data:${mimeType};base64,${btoa(binary)}`;
  return uazSendMediaUrl(to, kind, dataUrl, caption ?? null, filename);
}

/** Indicador "digitando…"/"gravando áudio…" na conversa. */
export async function uazPresence(
  to: string,
  presence: "composing" | "recording" | "paused" = "composing",
  delayMs = 3000,
): Promise<void> {
  try {
    await uazRequest("/message/presence", { number: uazNumber(to), presence, delay: delayMs });
  } catch (err) {
    console.warn("[whatsapp/uaz presence] falhou:", err instanceof Error ? err.message : err);
  }
}

/** Marca a conversa como lida no aparelho conectado. */
export async function uazMarkRead(chatid: string): Promise<void> {
  try {
    await uazRequest("/chat/markRead", { number: chatid, readchat: true });
  } catch {
    /* não crítico */
  }
}

// ================== Recebimento / histórico ==================

export type UazNormalized = {
  id: string;
  chatid: string;
  phone: string | null;
  fromMe: boolean;
  senderName: string | null;
  type: "text" | "image" | "video" | "audio" | "document" | "sticker" | "other";
  text: string;
  mediaUrl: string | null;
  mimeType: string | null;
  filename: string | null;
  timestampMs: number;
  replyId: string | null;
  /** Prévia textual da mensagem citada, quando a UazAPI a envia. */
  replySnippet: string | null;
};

const MEDIA_MAP: Record<string, UazNormalized["type"]> = {
  image: "image",
  imagemessage: "image",
  video: "video",
  videomessage: "video",
  audio: "audio",
  ptt: "audio",
  audiomessage: "audio",
  document: "document",
  documentmessage: "document",
  sticker: "sticker",
  stickermessage: "sticker",
  text: "text",
  conversation: "text",
  extendedtextmessage: "text",
  chat: "text",
};

/**
 * Extrai a mensagem citada (reply). A UazAPI varia bastante o formato:
 * campo direto, objeto `quoted`, ou o `contextInfo` cru do WhatsApp.
 */
function extrairCitada(m: Record<string, unknown>): { id: string | null; snippet: string | null } {
  const direto = pick<string>(m, "quotedMessageId", "replyid", "replyId", "quotedId", "stanzaId");
  const candidatos: unknown[] = [
    m.quoted,
    m.quotedMessage,
    m.contextInfo,
    m.messageContextInfo,
    (m.content as Record<string, unknown> | undefined)?.contextInfo,
    (m.message as Record<string, unknown> | undefined)?.contextInfo,
    ((m.message as Record<string, unknown> | undefined)?.extendedTextMessage as Record<string, unknown> | undefined)
      ?.contextInfo,
  ];

  let id = typeof direto === "string" ? direto : null;
  let snippet: string | null = null;

  for (const c of candidatos) {
    if (!c || typeof c !== "object") continue;
    const o = c as Record<string, unknown>;
    if (!id) {
      const cid = pick<string>(o, "stanzaId", "stanzaid", "id", "messageid", "messageId", "quotedMessageId");
      if (typeof cid === "string") id = cid;
    }
    if (!snippet) {
      const txt =
        pick<string>(o, "text", "body", "caption", "conversation") ??
        (o.quotedMessage && typeof o.quotedMessage === "object"
          ? pick<string>(o.quotedMessage as Record<string, unknown>, "text", "body", "caption", "conversation")
          : undefined);
      if (typeof txt === "string" && txt.trim()) snippet = txt.trim().slice(0, 300);
    }
    if (id && snippet) break;
  }

  return { id, snippet };
}

/** Converte a mensagem crua da UazAPI no formato interno do chatbot. */
export function normalizeUazMessage(raw: unknown, phoneHint?: string | null): UazNormalized | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  const id = pick<string>(m, "id", "messageid", "messageId", "key_id");
  const chatid = pick<string>(m, "chatid", "chatId", "jid", "from", "sender") ?? "";
  if (!id || !chatid) return null;

  const rawType = String(pick<string>(m, "messageType", "type", "mediaType") ?? "text").toLowerCase();
  const type = MEDIA_MAP[rawType] ?? (rawType.includes("image") ? "image"
    : rawType.includes("video") ? "video"
    : rawType.includes("audio") || rawType.includes("ptt") ? "audio"
    : rawType.includes("document") ? "document"
    : rawType.includes("text") || rawType.includes("conversation") ? "text"
    : "other");

  let text = pick<string>(m, "text", "body", "caption", "conversation") ?? "";
  if (typeof text !== "string" || !text) {
    const conteudo = m.content;
    if (typeof conteudo === "string") text = conteudo;
    else if (conteudo && typeof conteudo === "object") {
      text = (pick<string>(conteudo, "text", "caption", "conversation") ?? "") as string;
    }
  }
  const conteudoObj = m.content && typeof m.content === "object" ? (m.content as Record<string, unknown>) : null;
  const mediaUrl =
    pick<string>(m, "file", "fileURL", "mediaUrl", "url", "downloadUrl") ??
    (conteudoObj ? (pick<string>(conteudoObj, "URL", "url", "fileURL") ?? null) : null);
  const ts = Number(pick<number | string>(m, "messageTimestamp", "timestamp", "t", "messageTimestampMs") ?? 0);
  const timestampMs = !Number.isFinite(ts) || ts <= 0 ? Date.now() : ts > 1e12 ? ts : ts * 1000;

  return {
    id,
    chatid,
    phone: phoneHint ?? phoneFromChatId(chatid),
    fromMe: Boolean(pick(m, "fromMe", "fromme", "isFromMe")),
    senderName: pick<string>(m, "senderName", "pushName", "notifyName", "name") ?? null,
    type,
    text: typeof text === "string" ? text : "",
    mediaUrl: typeof mediaUrl === "string" ? mediaUrl : null,
    mimeType:
      pick<string>(m, "mimetype", "mimeType") ??
      (conteudoObj ? (pick<string>(conteudoObj, "mimetype", "mimeType") ?? null) : null),
    filename:
      pick<string>(m, "fileName", "filename", "docName") ??
      (conteudoObj ? (pick<string>(conteudoObj, "fileName", "filename", "title") ?? null) : null),
    timestampMs,
    replyId: citada.id,
    replySnippet: citada.snippet,
  };
}

/**
 * Pede à UazAPI que baixe e descriptografe a mídia da mensagem, devolvendo
 * uma URL já utilizável. Necessário porque o webhook entrega apenas a URL
 * criptografada (.enc) do WhatsApp.
 */
export async function uazResolveMedia(
  messageId: string,
): Promise<{ url: string; mimeType: string | null } | null> {
  try {
    const res = (await uazRequest("/message/download", { id: messageId })) as
      | { fileURL?: string; mimetype?: string }
      | null;
    if (!res?.fileURL) return null;
    return { url: res.fileURL, mimeType: res.mimetype ?? null };
  } catch (err) {
    console.warn("[whatsapp/uaz media] resolve falhou:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** Baixa uma mídia da UazAPI (URL própria da instância ou pública). */
export async function uazDownloadMedia(
  url: string,
): Promise<{ blob: Blob; mimeType: string } | null> {
  try {
    const sameHost = url.startsWith(uazBase());
    const res = await fetch(url, sameHost ? { headers: { token: uazToken() } } : undefined);
    if (!res.ok) {
      console.warn("[whatsapp/uaz media] download falhou:", res.status);
      return null;
    }
    const blob = await res.blob();
    return { blob, mimeType: res.headers.get("content-type") ?? blob.type ?? "application/octet-stream" };
  } catch (err) {
    console.warn("[whatsapp/uaz media] exceção no download:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** Lista as conversas individuais da instância (para sincronizar histórico). */
export async function uazListChats(
  limit = 200,
): Promise<Array<{ chatid: string; phone: string | null; name: string | null }>> {
  const out: Array<{ chatid: string; phone: string | null; name: string | null }> = [];
  for (const path of ["/chat/find", "/chats"]) {
    try {
      const raw = await uazRequest(path, { limit });
      const list = Array.isArray(raw)
        ? raw
        : ((pick<unknown[]>(raw, "chats", "data", "response", "list") ?? []) as unknown[]);
      for (const c of list) {
        const chatid = pick<string>(c, "wa_chatid", "chatid", "jid", "id");
        const phone = pick<string>(c, "phone") ?? phoneFromChatId(chatid ?? "");
        // Só conversas individuais: grupos, canais e status ficam de fora.
        if (!chatid || !phone || chatid.includes("@g.us") || chatid.includes("@newsletter")) continue;
        out.push({ chatid, phone, name: pick<string>(c, "name", "wa_name", "wa_contactName", "pushName") ?? null });
      }
      if (out.length) break;
    } catch (err) {
      console.warn("[whatsapp/uaz chats]", path, err instanceof Error ? err.message : err);
    }
  }
  return out;
}

/** Mensagens de uma conversa (histórico). */
export async function uazListMessages(
  chatid: string,
  limit = 50,
  phoneHint?: string | null,
): Promise<UazNormalized[]> {
  for (const path of ["/message/find", "/messages"]) {
    try {
      const raw = await uazRequest(path, { chatid, limit });
      const list = Array.isArray(raw)
        ? raw
        : ((pick<unknown[]>(raw, "messages", "data", "response", "list") ?? []) as unknown[]);
      const norm = list
        .map((item) => normalizeUazMessage(item, phoneHint ?? null))
        .filter((m): m is UazNormalized => Boolean(m));
      if (norm.length) return norm;
    } catch (err) {
      console.warn("[whatsapp/uaz messages]", path, err instanceof Error ? err.message : err);
    }
  }
  return [];
}

/** Status da instância conectada (para diagnóstico no painel). */
export async function uazInstanceStatus(): Promise<{ connected: boolean; detail: string }> {
  try {
    const res = await fetch(`${uazBase()}/instance/status`, { headers: { token: uazToken() } });
    const raw = await res.text();
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      /* texto puro */
    }
    const instance = pick<Record<string, unknown>>(parsed, "instance") ?? parsed;
    const status = String(pick<string>(instance, "status", "state", "connectionStatus") ?? "").toLowerCase();
    return { connected: status === "connected" || status === "open", detail: status || raw.slice(0, 120) };
  } catch (err) {
    return { connected: false, detail: err instanceof Error ? err.message : String(err) };
  }
}
