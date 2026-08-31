/**
 * Caixa de tokens por SMS / WhatsApp encaminhado.
 *
 * Usado por apps encaminhadores de SMS (ex.: "SMS Forwarder" no Android) ou
 * por qualquer automação que receba a mensagem com o código. Exige o segredo
 * OTP_INBOX_SECRET no header `x-otp-secret` (ou `?token=`).
 *
 * O código nunca aparece em log.
 */
import { createFileRoute } from "@tanstack/react-router";

async function lerPayload(request: Request): Promise<Record<string, string>> {
  const tipo = request.headers.get("content-type") ?? "";
  const out: Record<string, string> = {};
  if (tipo.includes("application/json")) {
    const j = (await request.json()) as Record<string, unknown>;
    for (const [k, v] of Object.entries(j)) if (typeof v === "string") out[k.toLowerCase()] = v;
    return out;
  }
  if (tipo.includes("form")) {
    const f = await request.formData();
    for (const [k, v] of f.entries()) if (typeof v === "string") out[k.toLowerCase()] = v;
    return out;
  }
  out["text"] = await request.text();
  return out;
}

export const Route = createFileRoute("/api/public/otp-inbox")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const segredo = process.env["OTP_INBOX_SECRET"];
        const enviado = request.headers.get("x-otp-secret") ?? url.searchParams.get("token") ?? "";
        if (!segredo || enviado !== segredo) return new Response("unauthorized", { status: 401 });

        const p = await lerPayload(request);
        const texto = p["text"] ?? p["message"] ?? p["body"] ?? p["msg"] ?? "";
        if (!texto.trim()) return Response.json({ ok: false, motivo: "sem_texto" }, { status: 202 });

        const origem = (p["source"] ?? url.searchParams.get("source") ?? "sms").toLowerCase();
        const { registrarCodigoMensagem } = await import("@/lib/auth-code/inbox.server");
        const r = await registrarCodigoMensagem({
          source: origem === "whatsapp" ? "whatsapp" : origem === "api" ? "api" : "sms",
          texto,
          sender: p["from"] ?? p["sender"] ?? null,
          provider: p["provider"] ?? url.searchParams.get("provider") ?? null,
        });
        return Response.json(r, { status: r.ok ? 200 : 202 });
      },
      GET: async () => new Response("ok", { status: 200 }),
    },
  },
});
