/**
 * Envia mensagens pelo WhatsApp Cloud API (Meta).
 * SERVER-ONLY — nunca importar de rotas/componentes.
 */

const GRAPH_VERSION = "v21.0";

function normalizePhone(raw: string): string {
  // Meta espera E.164 sem o "+". Ex.: "+55 (48) 99999-9999" -> "5548999999999".
  // Se vier só DDD+número (10 ou 11 dígitos), assume Brasil e prefixa 55.
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) return "55" + digits;
  return digits;
}

export async function sendWhatsAppText(to: string, body: string): Promise<{ id: string | null; error?: string }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) {
    return { id: null, error: "WhatsApp credentials missing" };
  }

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
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const rawText = await res.text();
    console.log("[whatsapp/send] RESPONSE", JSON.stringify({ status: res.status, ok: res.ok }));
    let data: { messages?: Array<{ id: string }>; error?: { message: string; code?: number; error_subcode?: number; error_data?: unknown; fbtrace_id?: string } } = {};
    try { data = JSON.parse(rawText); } catch { /* keep empty */ }
    if (!res.ok) {
      const msg = data.error?.message ?? `HTTP ${res.status}: ${rawText.slice(0, 200)}`;
      console.error("[whatsapp/send] falha:", msg, "full_error:", JSON.stringify(data.error));
      return { id: null, error: msg };
    }
    return { id: data.messages?.[0]?.id ?? null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[whatsapp/send] exception:", msg);
    return { id: null, error: msg };
  }
}

/**
 * Mostra o indicador "digitando…" pro cliente no WhatsApp e marca a mensagem como lida.
 * O indicador some sozinho em ~25s ou quando enviarmos a próxima mensagem.
 * Requer o wa_message_id da última mensagem recebida do cliente.
 */
export async function sendWhatsAppTypingIndicator(inbound_wa_message_id: string): Promise<void> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return;

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
 * Divide a resposta em balões pelo separador de linha dupla e envia sequencialmente
 * com um pequeno delay entre balões (mais humano). Retorna os wa_message_ids.
 *
 * Se `prefix` for informado, é anexado ao PRIMEIRO balão (ex: "*Roberto:*\nolá...").
 */
export async function sendWhatsAppBubbles(
  to: string,
  fullText: string,
  prefix?: string | null,
): Promise<Array<{ text: string; id: string | null; error?: string }>> {
  // Cada quebra de linha vira um balão separado (mais natural no WhatsApp).
  const bubbles = fullText
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
    // Primeira letra de cada balão em MAIÚSCULA (preserva o resto).
    .map((s) => s.charAt(0).toLocaleUpperCase("pt-BR") + s.slice(1));
  const out: Array<{ text: string; id: string | null; error?: string }> = [];
  for (let i = 0; i < bubbles.length; i++) {
    const body = i === 0 && prefix ? `${prefix}\n${bubbles[i]}` : bubbles[i];
    if (i > 0) {
      // Delay proporcional ao tamanho do balão anterior (parece "digitando").
      const prevLen = bubbles[i - 1].length;
      let delay = Math.min(6000, 1200 + prevLen * 55);
      // Se o balão ATUAL começa com nome de hotel em negrito (*Hotel Tal*),
      // dá uma pausa maior antes — simula "pesquisando a próxima opção".
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

/**
 * Envia uma imagem por link público (URL assinada). Meta baixa a imagem no ato.
 */
export async function sendWhatsAppImage(
  to: string,
  link: string,
  caption?: string | null,
): Promise<{ id: string | null; error?: string }> {
  return sendMedia(to, { type: "image", image: { link, ...(caption ? { caption: caption.slice(0, 1024) } : {}) } });
}

/**
 * Envia um documento (PDF etc.) por link público.
 */
export async function sendWhatsAppDocument(
  to: string,
  link: string,
  filename: string,
  caption?: string | null,
): Promise<{ id: string | null; error?: string }> {
  return sendMedia(to, {
    type: "document",
    document: { link, filename: filename.slice(0, 240), ...(caption ? { caption: caption.slice(0, 1024) } : {}) },
  });
}

async function sendMedia(to: string, extra: Record<string, unknown>): Promise<{ id: string | null; error?: string }> {
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
      console.error("[whatsapp/sendMedia] falha:", msg);
      return { id: null, error: msg };
    }
    return { id: data.messages?.[0]?.id ?? null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[whatsapp/sendMedia] exception:", msg);
    return { id: null, error: msg };
  }
}


