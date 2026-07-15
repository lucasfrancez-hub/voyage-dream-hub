/**
 * Envia mensagem interativa com botões (WhatsApp Cloud API).
 * SERVER-ONLY.
 *
 * Usado pelo robô de monitoramento de voos (sem nome de atendente).
 */

const GRAPH_VERSION = "v21.0";

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "");
}

export type WaButton = { id: string; title: string };

export async function sendWhatsAppButtons(input: {
  to: string;
  body: string;
  buttons: WaButton[]; // até 3
  footer?: string;
}): Promise<{ id: string | null; error?: string }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) {
    return { id: null, error: "WhatsApp credentials missing" };
  }

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalizePhone(input.to),
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: input.body.slice(0, 1024) },
      ...(input.footer ? { footer: { text: input.footer.slice(0, 60) } } : {}),
      action: {
        buttons: input.buttons.slice(0, 3).map((b) => ({
          type: "reply",
          reply: { id: b.id.slice(0, 256), title: b.title.slice(0, 20) },
        })),
      },
    },
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
    let data: { messages?: Array<{ id: string }>; error?: { message: string } } = {};
    try { data = JSON.parse(rawText); } catch { /* keep empty */ }
    if (!res.ok) {
      const msg = data.error?.message ?? `HTTP ${res.status}: ${rawText.slice(0, 200)}`;
      console.error("[wa/send-buttons] falha:", msg);
      return { id: null, error: msg };
    }
    return { id: data.messages?.[0]?.id ?? null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[wa/send-buttons] exception:", msg);
    return { id: null, error: msg };
  }
}
