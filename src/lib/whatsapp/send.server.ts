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
    const data = (await res.json()) as { messages?: Array<{ id: string }>; error?: { message: string } };
    if (!res.ok) {
      const msg = data.error?.message ?? `HTTP ${res.status}`;
      console.error("[whatsapp/send] falha:", msg);
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
 */
export async function sendWhatsAppBubbles(to: string, fullText: string): Promise<Array<{ text: string; id: string | null; error?: string }>> {
  // Cada quebra de linha vira um balão separado (mais natural no WhatsApp).
  const bubbles = fullText
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: Array<{ text: string; id: string | null; error?: string }> = [];
  for (const b of bubbles) {
    const r = await sendWhatsAppText(to, b);
    out.push({ text: b, ...r });
    if (bubbles.length > 1) await new Promise((r) => setTimeout(r, 700));
  }
  return out;
}
