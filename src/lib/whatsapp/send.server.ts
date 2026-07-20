/**
 * Envia mensagens pelo WhatsApp.
 * Provedor principal: UazAPI (não-oficial, QR Code — self-hosted em viaair.uazapi.com).
 * Fallback: Meta Cloud API (se UAZAPI_URL/UAZAPI_TOKEN não estiverem configurados).
 * SERVER-ONLY — nunca importar de rotas/componentes.
 */

const GRAPH_VERSION = "v21.0";

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) return "55" + digits;
  return digits;
}

function uazConfigured(): boolean {
  return !!(process.env.UAZAPI_URL && process.env.UAZAPI_TOKEN);
}

// ================== UazAPI ==================

async function uazPost(path: string, body: Record<string, unknown>): Promise<{ id: string | null; error?: string }> {
  const base = process.env.UAZAPI_URL!.replace(/\/+$/, "");
  const token = process.env.UAZAPI_TOKEN!;
  try {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        token,
      },
      body: JSON.stringify(body),
    });
    const raw = await res.text();
    let data: { id?: string; messageid?: string; message?: { id?: string }; error?: string; response?: string } = {};
    try { data = JSON.parse(raw); } catch { /* keep empty */ }
    console.log("[uazapi]", path, "status=", res.status, "ok=", res.ok);
    if (!res.ok) {
      const msg = data.error ?? data.response ?? `HTTP ${res.status}: ${raw.slice(0, 200)}`;
      console.error("[uazapi] falha:", msg);
      return { id: null, error: msg };
    }
    const id = data.id ?? data.messageid ?? data.message?.id ?? null;
    return { id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[uazapi] exception:", msg);
    return { id: null, error: msg };
  }
}

async function uazSendText(to: string, body: string): Promise<{ id: string | null; error?: string }> {
  return uazPost("/send/text", {
    number: normalizePhone(to),
    text: body.slice(0, 4090),
    linkPreview: true,
  });
}

function mimeForType(type: "image" | "document" | "video" | "audio", filename?: string): string {
  if (type === "image") return "image/jpeg";
  if (type === "video") return "video/mp4";
  if (type === "audio") return "audio/mpeg";
  const ext = (filename ?? "").toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  return "application/octet-stream";
}

async function uazSendMedia(
  to: string,
  type: "image" | "document" | "video" | "audio",
  link: string,
  opts: { caption?: string | null; filename?: string } = {},
): Promise<{ id: string | null; error?: string }> {
  // Baixa o arquivo no worker e envia como data URI base64 — o processador da
  // UazAPI falha (HTTP 400/404) tentando buscar URLs assinadas do Supabase,
  // então nunca caímos de volta para a URL crua.
  let dataUri: string;
  try {
    const dl = await fetch(link);
    if (!dl.ok) {
      const msg = `download falhou (${dl.status})`;
      console.error("[uazapi] " + msg, link.slice(0, 120));
      return { id: null, error: msg };
    }
    const buf = new Uint8Array(await dl.arrayBuffer());
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < buf.length; i += chunk) {
      bin += String.fromCharCode(...buf.subarray(i, i + chunk));
    }
    const b64 = btoa(bin);
    const mime = mimeForType(type, opts.filename);
    dataUri = `data:${mime};base64,${b64}`;
    console.log("[uazapi] download ok:", buf.length, "bytes", mime);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[uazapi] exceção no download:", msg);
    return { id: null, error: `download exception: ${msg}` };
  }
  return uazPost("/send/media", {
    number: normalizePhone(to),
    type,
    file: dataUri,
    ...(opts.caption ? { text: opts.caption.slice(0, 1024) } : {}),
    ...(opts.filename ? { docName: opts.filename.slice(0, 240) } : {}),
  });
}

async function uazSendMediaBytes(
  to: string,
  type: "image" | "document" | "video" | "audio",
  bytes: Uint8Array,
  opts: { caption?: string | null; filename?: string } = {},
): Promise<{ id: string | null; error?: string }> {
  if (bytes.byteLength === 0) return { id: null, error: "arquivo vazio" };

  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const mime = mimeForType(type, opts.filename);
  const dataUri = `data:${mime};base64,${btoa(bin)}`;

  return uazPost("/send/media", {
    number: normalizePhone(to),
    type,
    file: dataUri,
    ...(opts.caption ? { text: opts.caption.slice(0, 1024) } : {}),
    ...(opts.filename ? { docName: opts.filename.slice(0, 240) } : {}),
  });
}

// ================== Meta (fallback) ==================

async function metaSendText(to: string, body: string): Promise<{ id: string | null; error?: string }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return { id: null, error: "WhatsApp credentials missing" };

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalizePhone(to),
    type: "text",
    text: { preview_url: true, body: body.slice(0, 4090) },
  };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const rawText = await res.text();
    let data: { messages?: Array<{ id: string }>; error?: { message: string } } = {};
    try { data = JSON.parse(rawText); } catch { /* keep empty */ }
    if (!res.ok) {
      const msg = data.error?.message ?? `HTTP ${res.status}: ${rawText.slice(0, 200)}`;
      console.error("[whatsapp/meta send] falha:", msg);
      return { id: null, error: msg };
    }
    return { id: data.messages?.[0]?.id ?? null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { id: null, error: msg };
  }
}

async function metaSendMedia(to: string, extra: Record<string, unknown>): Promise<{ id: string | null; error?: string }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return { id: null, error: "WhatsApp credentials missing" };
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalizePhone(to),
    ...extra,
  };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const rawText = await res.text();
    let data: { messages?: Array<{ id: string }>; error?: { message: string } } = {};
    try { data = JSON.parse(rawText); } catch { /* keep empty */ }
    if (!res.ok) {
      const msg = data.error?.message ?? `HTTP ${res.status}: ${rawText.slice(0, 200)}`;
      console.error("[whatsapp/meta media] falha:", msg);
      return { id: null, error: msg };
    }
    return { id: data.messages?.[0]?.id ?? null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { id: null, error: msg };
  }
}

// ================== API pública (mantém assinaturas) ==================

export async function sendWhatsAppText(to: string, body: string): Promise<{ id: string | null; error?: string }> {
  if (uazConfigured()) return uazSendText(to, body);
  return metaSendText(to, body);
}

/**
 * Indicador "digitando…" — UazAPI usa /message/presence, Meta usa typing_indicator.
 */
export async function sendWhatsAppTypingIndicator(inbound_wa_message_id: string, to?: string): Promise<void> {
  if (uazConfigured() && to) {
    try {
      const base = process.env.UAZAPI_URL!.replace(/\/+$/, "");
      await fetch(`${base}/message/presence`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token: process.env.UAZAPI_TOKEN! },
        body: JSON.stringify({ number: normalizePhone(to), presence: "composing", delay: 2000 }),
      });
    } catch (err) {
      console.warn("[uazapi/typing] falhou:", err instanceof Error ? err.message : err);
    }
    return;
  }
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId || !inbound_wa_message_id) return;
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    status: "read",
    message_id: inbound_wa_message_id,
    typing_indicator: { type: "text" },
  };
  try {
    await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.warn("[whatsapp/typing] falhou:", err instanceof Error ? err.message : err);
  }
}

export async function sendWhatsAppBubbles(
  to: string,
  fullText: string,
  prefix?: string | null,
): Promise<Array<{ text: string; id: string | null; error?: string }>> {
  const bubbles = fullText
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.charAt(0).toLocaleUpperCase("pt-BR") + s.slice(1));
  const out: Array<{ text: string; id: string | null; error?: string }> = [];
  for (let i = 0; i < bubbles.length; i++) {
    const body = i === 0 && prefix ? `${prefix}\n${bubbles[i]}` : bubbles[i];
    if (i > 0) {
      const prevLen = bubbles[i - 1].length;
      let delay = Math.min(6000, 1200 + prevLen * 55);
      const cur = bubbles[i];
      const looksLikeHotelHeader = /^\*[^*\n]{3,80}\*\s*$/.test(cur);
      if (looksLikeHotelHeader) delay += 3500 + Math.floor(Math.random() * 2500);
      await new Promise((r) => setTimeout(r, delay));
    }
    const r = await sendWhatsAppText(to, body);
    out.push({ text: body, ...r });
  }
  return out;
}

export async function sendWhatsAppImage(
  to: string,
  link: string,
  caption?: string | null,
): Promise<{ id: string | null; error?: string }> {
  if (uazConfigured()) return uazSendMedia(to, "image", link, { caption });
  return metaSendMedia(to, { type: "image", image: { link, ...(caption ? { caption: caption.slice(0, 1024) } : {}) } });
}

export async function sendWhatsAppDocument(
  to: string,
  link: string,
  filename: string,
  caption?: string | null,
): Promise<{ id: string | null; error?: string }> {
  if (uazConfigured()) return uazSendMedia(to, "document", link, { caption, filename });
  return metaSendMedia(to, {
    type: "document",
    document: { link, filename: filename.slice(0, 240), ...(caption ? { caption: caption.slice(0, 1024) } : {}) },
  });
}

/**
 * Envia um documento já carregado pelo servidor. Evita URLs assinadas e
 * permite que a entrega de cartões use diretamente os bytes do storage.
 */
export async function sendWhatsAppDocumentBytes(
  to: string,
  bytes: Uint8Array,
  filename: string,
  caption?: string | null,
  fallbackLink?: string,
): Promise<{ id: string | null; error?: string }> {
  if (uazConfigured()) {
    return uazSendMediaBytes(to, "document", bytes, { caption, filename });
  }
  if (!fallbackLink) return { id: null, error: "URL do documento ausente" };
  return metaSendMedia(to, {
    type: "document",
    document: {
      link: fallbackLink,
      filename: filename.slice(0, 240),
      ...(caption ? { caption: caption.slice(0, 1024) } : {}),
    },
  });
}
