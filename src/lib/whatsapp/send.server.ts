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
    const id = data.messages?.[0]?.id ?? null;
    if (!id) return { id: null, error: "Meta aceitou a mídia sem retornar o ID da mensagem" };
    return { id };
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
  // Sanitiza: junta fragmentos que começam com pontuação (ex.: ", tá bom?" quando
  // o nome do cliente ficou vazio) e descarta balões sem nenhuma letra/número.
  const cleaned: string[] = [];
  for (const raw of bubbles.map((b) => stripTrailingPeriod(b)).filter(Boolean)) {
    // Limpa pontuação solta sem apagar "- " de listas legítimas.
    const b = raw.replace(/^[\s,;:]+/u, "").trim();
    if (!b || !/[\p{L}\p{N}]/u.test(b)) continue;
    cleaned.push(b.charAt(0).toLocaleUpperCase("pt-BR") + b.slice(1));
  }
  return cleaned;
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


/**
 * Pausa "humana" entre balões: proporcional ao tamanho do próximo texto,
 * como se o atendente estivesse digitando. Mínimo 1,2s, máximo 4,5s por
 * balão e teto de ~14s no total da sequência.
 */
function typingPause(nextBubble: string, restante: number): number {
  const base = 900 + nextBubble.length * 28; // ~28ms por caractere
  const gap = Math.max(1200, Math.min(4500, base));
  return Math.min(gap, Math.max(1000, Math.floor(14000 / Math.max(1, restante))));
}

export async function sendWhatsAppBubbles(
  to: string,
  fullText: string,
  prefix?: string | null,
  opts?: { replyId?: string | null; typingId?: string | null },
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
    // Entre um balão e outro: reacende o "digitando…" e espera alguns
    // segundos, pra conversa parecer humana em vez de tudo de uma vez.
    if (i < bubbles.length - 1) {
      const proximo = bubbles[i + 1];
      if (opts?.typingId) {
        await sendWhatsAppTypingIndicator(opts.typingId, to).catch(() => {});
      }
      await new Promise((r) => setTimeout(r, typingPause(proximo, bubbles.length - 1 - i)));
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
  const uploaded = await metaUploadMedia(bytes, filename, "image/png");
  if (uploaded.id) {
    const byId = await metaSendMedia(to, {
      type: "image",
      image: { id: uploaded.id, ...(caption ? { caption: caption.slice(0, 1024) } : {}) },
    });
    if (byId.id || !fallbackLink) return byId;
    // Há casos em que o upload é aceito, mas a Meta recusa o envio pelo media
    // ID logo depois. A URL pública já está pronta: tenta por ela antes de
    // considerar o card perdido e deixar o watchdog gerar a mesma arte sempre.
    console.warn("[whatsapp/meta image] envio por media ID falhou; tentando URL:", byId.error);
    return metaSendMedia(to, {
      type: "image",
      image: { link: fallbackLink, ...(caption ? { caption: caption.slice(0, 1024) } : {}) },
    });
  }
  if (!fallbackLink) return uploaded;
  console.warn("[whatsapp/meta image] upload direto falhou; tentando URL:", uploaded.error);
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
