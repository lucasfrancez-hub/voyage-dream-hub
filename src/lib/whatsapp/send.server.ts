/**
 * Envia mensagens pelo WhatsApp oficial da VIA AIR.
 * O chat, alertas e automações usam exclusivamente a Meta Cloud API.
 * UazAPI fica restrita ao módulo independente de broadcast.
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

async function uazSendText(to: string, body: string, replyId?: string | null): Promise<{ id: string | null; error?: string }> {
  return uazPost("/send/text", {
    number: normalizePhone(to),
    text: body.slice(0, 4090),
    linkPreview: true,
    // UazAPI v2 usa `replyid` (minúsculo) pra citar/responder uma mensagem.
    ...(replyId ? { replyid: replyId } : {}),
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
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const rawText = await res.text();
      let data: { messages?: Array<{ id: string }>; error?: { message: string } } = {};
      try { data = JSON.parse(rawText); } catch { /* keep empty */ }
      if (res.ok) {
        const id = data.messages?.[0]?.id ?? null;
        if (!id) return { id: null, error: "Meta aceitou o envio sem retornar o ID da mensagem" };
        return { id };
      }

      const msg = data.error?.message ?? `HTTP ${res.status}: ${rawText.slice(0, 200)}`;
      const transient = res.status === 408 || res.status === 429 || res.status >= 500;
      console.error(`[whatsapp/meta send] tentativa ${attempt}/3 falhou:`, msg);
      if (!transient || attempt === 3) return { id: null, error: msg };
      await new Promise((resolve) => setTimeout(resolve, attempt * 250));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[whatsapp/meta send] tentativa ${attempt}/3 gerou exceção:`, msg);
      if (attempt === 3) return { id: null, error: msg };
      await new Promise((resolve) => setTimeout(resolve, attempt * 250));
    }
  }
  return { id: null, error: "Falha inesperada ao enviar pela Meta" };
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

export async function sendWhatsAppText(to: string, body: string, replyId?: string | null): Promise<{ id: string | null; error?: string }> {
  // Chat oficial: sempre Meta. Reply nativo usa context.message_id.
  if (replyId) {
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!token || !phoneId) return { id: null, error: "WhatsApp credentials missing" };
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: normalizePhone(to),
          context: { message_id: replyId },
          type: "text",
          text: { preview_url: true, body: body.slice(0, 4090) },
        }),
      });
      const rawText = await res.text();
      let data: { messages?: Array<{ id: string }>; error?: { message: string } } = {};
      try { data = JSON.parse(rawText); } catch { /* keep empty */ }
      if (!res.ok) return { id: null, error: data.error?.message ?? `HTTP ${res.status}` };
      return { id: data.messages?.[0]?.id ?? null };
    } catch (err) {
      return { id: null, error: err instanceof Error ? err.message : String(err) };
    }
  }
  return metaSendText(to, body);
}

/**
 * Indicador "digitando…" — UazAPI usa /message/presence, Meta usa typing_indicator.
 */
export async function sendWhatsAppTypingIndicator(inbound_wa_message_id: string, to?: string): Promise<void> {
  void to;
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
  opts?: { replyId?: string | null },
): Promise<Array<{ text: string; id: string | null; error?: string }>> {
  const bubbles = fullText
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.charAt(0).toLocaleUpperCase("pt-BR") + s.slice(1));
  const out: Array<{ text: string; id: string | null; error?: string }> = [];
  // Sem espera artificial entre balões: a geração da IA já consumiu parte da
  // execução do worker. Cada resposta da Meta confirma que o trecho foi aceito
  // antes de avançarmos para o próximo, preservando a ordem sem perder o final.
  for (let i = 0; i < bubbles.length; i++) {
    const body = i === 0 && prefix ? `${prefix}\n${bubbles[i]}` : bubbles[i];
    const replyId = i === 0 ? opts?.replyId ?? null : null;
    try {
      const r = await sendWhatsAppText(to, body, replyId);
      out.push({ text: body, ...r });
      if (r.error) console.warn(`[bubbles] falha #${i + 1}:`, r.error);
      else console.log(`[bubbles/meta] trecho #${i + 1}/${bubbles.length} aceito:`, r.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[bubbles] exception #${i + 1}:`, msg);
      out.push({ text: body, id: null, error: msg });
      // continua para os próximos balões — não aborta a sequência
    }
  }
  return out;
}

export async function sendWhatsAppImage(
  to: string,
  link: string,
  caption?: string | null,
): Promise<{ id: string | null; error?: string }> {
  return metaSendMedia(to, { type: "image", image: { link, ...(caption ? { caption: caption.slice(0, 1024) } : {}) } });
}

export async function sendWhatsAppDocument(
  to: string,
  link: string,
  filename: string,
  caption?: string | null,
): Promise<{ id: string | null; error?: string }> {
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
  void bytes;
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

/**
 * Envia uma imagem já carregada pelo servidor — usada para cartões de
 * embarque capturados como PNG, que exibem preview direto no WhatsApp.
 */
export async function sendWhatsAppImageBytes(
  to: string,
  bytes: Uint8Array,
  filename: string,
  caption?: string | null,
  fallbackLink?: string,
): Promise<{ id: string | null; error?: string }> {
  void bytes;
  if (!fallbackLink) return { id: null, error: "URL da imagem ausente" };
  return metaSendMedia(to, {
    type: "image",
    image: { link: fallbackLink, ...(caption ? { caption: caption.slice(0, 1024) } : {}) },
  });
}

