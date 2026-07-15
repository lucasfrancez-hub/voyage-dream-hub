/**
 * Envia mensagens pelo WhatsApp Cloud API (Meta).
 * SERVER-ONLY — nunca importar de rotas/componentes.
 */

const GRAPH_VERSION = "v21.0";

function normalizePhone(raw: string): string {
  // Meta espera E.164 sem o "+". "+55 (48) 99999-9999" -> "5548999999999"
  return raw.replace(/\D/g, "");
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
      const delay = Math.min(4500, 900 + prevLen * 45);
      await new Promise((r) => setTimeout(r, delay));
    }
    const r = await sendWhatsAppText(to, body);
    out.push({ text: body, ...r });
  }
  return out;
}

