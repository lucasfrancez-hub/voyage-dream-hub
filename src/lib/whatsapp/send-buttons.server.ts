/**
 * Envia mensagem interativa com botões.
 * Provedor principal: UazAPI (/send/menu type=button).
 * Fallback: Meta Cloud API (interactive buttons).
 * SERVER-ONLY.
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

export type WaButton = { id: string; title: string };

async function uazSendButtons(input: {
  to: string;
  body: string;
  buttons: WaButton[];
  footer?: string;
}): Promise<{ id: string | null; error?: string }> {
  const base = process.env.UAZAPI_URL!.replace(/\/+$/, "");
  const token = process.env.UAZAPI_TOKEN!;
  const payload = {
    number: normalizePhone(input.to),
    type: "button",
    text: input.body.slice(0, 1024),
    footerText: input.footer?.slice(0, 60) ?? "",
    choices: input.buttons.slice(0, 3).map((b) => b.title.slice(0, 20)),
  };
  try {
    const res = await fetch(`${base}/send/menu`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token },
      body: JSON.stringify(payload),
    });
    const raw = await res.text();
    let data: { id?: string; messageid?: string; message?: { id?: string }; error?: string; response?: string } = {};
    try { data = JSON.parse(raw); } catch { /* keep empty */ }
    console.log("[uazapi/send-buttons] status=", res.status, "ok=", res.ok);
    if (!res.ok) {
      const msg = data.error ?? data.response ?? `HTTP ${res.status}: ${raw.slice(0, 200)}`;
      console.error("[uazapi/send-buttons] falha:", msg);
      return { id: null, error: msg };
    }
    return { id: data.id ?? data.messageid ?? data.message?.id ?? null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[uazapi/send-buttons] exception:", msg);
    return { id: null, error: msg };
  }
}

async function metaSendButtons(input: {
  to: string;
  body: string;
  buttons: WaButton[];
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
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const rawText = await res.text();
    let data: { messages?: Array<{ id: string }>; error?: { message: string } } = {};
    try { data = JSON.parse(rawText); } catch { /* keep empty */ }
    if (!res.ok) {
      const msg = data.error?.message ?? `HTTP ${res.status}: ${rawText.slice(0, 200)}`;
      console.error("[wa/send-buttons meta] falha:", msg);
      return { id: null, error: msg };
    }
    return { id: data.messages?.[0]?.id ?? null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[wa/send-buttons meta] exception:", msg);
    return { id: null, error: msg };
  }
}

export async function sendWhatsAppButtons(input: {
  to: string;
  body: string;
  buttons: WaButton[]; // até 3
  footer?: string;
}): Promise<{ id: string | null; error?: string }> {
  if (uazConfigured()) return uazSendButtons(input);
  return metaSendButtons(input);
}
