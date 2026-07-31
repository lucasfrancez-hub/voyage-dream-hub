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

// ================== Meta Cloud API ==================

async function metaSendText(
  to: string,
  body: string,
  replyId?: string | null,
): Promise<{ id: string | null; error?: string }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return { id: null, error: "WhatsApp credentials missing" };

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalizePhone(to),
    ...(replyId ? { context: { message_id: replyId } } : {}),
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
      try {
        data = JSON.parse(rawText);
      } catch {
        /* keep empty */
      }
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

async function metaSendMedia(
  to: string,
  extra: Record<string, unknown>,
): Promise<{ id: string | null; error?: string }> {
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
    try {
      data = JSON.parse(rawText);
    } catch {
      /* keep empty */
    }
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

async function metaUploadMedia(
  bytes: Uint8Array,
  filename: string,
  mimeType: string,
): Promise<{ id: string | null; error?: string }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return { id: null, error: "WhatsApp credentials missing" };

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", mimeType);
  const ownedBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ownedBuffer).set(bytes);
  form.append("file", new Blob([ownedBuffer], { type: mimeType }), filename);

  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const rawText = await res.text();
    let data: { id?: string; error?: { message?: string; error_data?: { details?: string } } } = {};
    try {
      data = JSON.parse(rawText);
    } catch {
      /* keep empty */
    }
    if (!res.ok || !data.id) {
      const details = data.error?.error_data?.details;
      const message = data.error?.message ?? `HTTP ${res.status}: ${rawText.slice(0, 300)}`;
      return { id: null, error: details ? `${message} — ${details}` : message };
    }
    return { id: data.id };
  } catch (err) {
    return { id: null, error: err instanceof Error ? err.message : String(err) };
  }
}

// ================== API pública (mantém assinaturas) ==================

export async function sendWhatsAppText(
  to: string,
  body: string,
  replyId?: string | null,
): Promise<{ id: string | null; error?: string }> {
  // Chat oficial: sempre Meta. Reply nativo usa context.message_id.
  return metaSendText(to, body, replyId);
}

/** Indicador "digitando…" oficial da Meta. */
export async function sendWhatsAppTypingIndicator(
  inbound_wa_message_id: string,
  to?: string,
): Promise<void> {
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

/**
 * Divide um texto em balões (parágrafos separados por linha em branco),
 * já com capitalização inicial e sem parágrafos vazios. Usado tanto pelo
 * envio Meta quanto pelo painel, pra que o preview registre um wa_messages
 * por balão (mesmo padrão que chega no WhatsApp do cliente).
 */
export function splitToBubbles(fullText: string, prefix?: string | null): string[] {
  const paragraphs = fullText
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.charAt(0).toLocaleUpperCase("pt-BR") + s.slice(1));
  const rawBubbles = paragraphs.length ? paragraphs : [fullText.trim()].filter(Boolean);
  if (prefix?.trim() && rawBubbles.length) {
    rawBubbles[0] = `${prefix.trim()}\n${rawBubbles[0]}`;
  }
  // Quebra parágrafos gigantes no limite oficial da Meta (~4096)
  const bubbles: string[] = [];
  for (const p of rawBubbles) {
    let remaining = p;
    while (remaining.length > 4000) {
      let splitAt = remaining.lastIndexOf(" ", 4000);
      if (splitAt < 1) splitAt = 4000;
      bubbles.push(remaining.slice(0, splitAt).trim());
      remaining = remaining.slice(splitAt).trim();
    }
    if (remaining) bubbles.push(remaining);
  }
  return bubbles.map((b) => stripTrailingPeriod(b)).filter(Boolean);
}

/**
 * Tira o ponto final de cada balão — fica mais natural no WhatsApp.
 * Mantém "?", "!", reticências, ":" e listas (linhas com "-").
 */
export function stripTrailingPeriod(bubble: string): string {
  const trimmed = bubble.replace(/\s+$/u, "");
  if (/\.\.\.$/u.test(trimmed)) return trimmed;
  // não mexe em abreviações/siglas: "S.A.", "etc." precedido de ponto
  if (/(?:^|\s)[\p{Lu}]\.$/u.test(trimmed)) return trimmed;
  return trimmed.replace(/\.$/u, "");
}


export async function sendWhatsAppBubbles(
  to: string,
  fullText: string,
  prefix?: string | null,
  opts?: { replyId?: string | null },
): Promise<Array<{ text: string; id: string | null; error?: string }>> {
  const bubbles = splitToBubbles(fullText, prefix);
  const out: Array<{ text: string; id: string | null; error?: string }> = [];
  for (let i = 0; i < bubbles.length; i++) {
    const body = bubbles[i];
    const replyId = i === 0 ? (opts?.replyId ?? null) : null;
    try {
      const r = await sendWhatsAppText(to, body, replyId);
      out.push({ text: body, ...r });
      if (r.error) console.warn(`[bubbles] falha #${i + 1}:`, r.error);
      else console.log(`[bubbles/meta] balão #${i + 1}/${bubbles.length} aceito:`, r.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[bubbles] exception #${i + 1}:`, msg);
      out.push({ text: body, id: null, error: msg });
      // continua para os próximos balões — não aborta a sequência
    }
    // pequena pausa entre balões pra chegarem em ordem no WhatsApp,
    // sem estourar o tempo do worker (máx ~1s total mesmo com muitos balões)
    if (i < bubbles.length - 1) {
      const gap = Math.min(400, Math.floor(1000 / Math.max(1, bubbles.length - 1)));
      await new Promise((r) => setTimeout(r, gap));
    }
  }
  return out;
}


export async function sendWhatsAppImage(
  to: string,
  link: string,
  caption?: string | null,
): Promise<{ id: string | null; error?: string }> {
  return metaSendMedia(to, {
    type: "image",
    image: { link, ...(caption ? { caption: caption.slice(0, 1024) } : {}) },
  });
}

export async function sendWhatsAppDocument(
  to: string,
  link: string,
  filename: string,
  caption?: string | null,
): Promise<{ id: string | null; error?: string }> {
  return metaSendMedia(to, {
    type: "document",
    document: {
      link,
      filename: filename.slice(0, 240),
      ...(caption ? { caption: caption.slice(0, 1024) } : {}),
    },
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

/** Envia um áudio (nota de voz) por link público/assinado. */
export async function sendWhatsAppAudio(
  to: string,
  link: string,
): Promise<{ id: string | null; error?: string }> {
  return metaSendMedia(to, { type: "audio", audio: { link } });
}

/**
 * Faz upload do áudio diretamente para a Meta e envia pelo media ID retornado.
 * Evita a aceitação enganosa que ocorre quando a API aceita uma URL assinada,
 * mas falha de forma assíncrona ao baixar ou processar o arquivo.
 */
export async function sendWhatsAppAudioBytes(
  to: string,
  bytes: Uint8Array,
  filename: string,
  mimeType: string,
): Promise<{ id: string | null; error?: string }> {
  const uploaded = await metaUploadMedia(bytes, filename, mimeType);
  if (!uploaded.id) return uploaded;
  return metaSendMedia(to, { type: "audio", audio: { id: uploaded.id } });
}
