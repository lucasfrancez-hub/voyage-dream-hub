/**
 * Entrada dos e-mails com o código de acesso da Comprar Viagem.
 *
 * Protegido por segredo (`x-oner-secret` ou `?token=`). O código nunca
 * aparece em log nem na resposta.
 */
import { createFileRoute } from "@tanstack/react-router";

async function lerCampos(request: Request): Promise<Record<string, string>> {
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

export const Route = createFileRoute("/api/public/oner-otp-inbox")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const segredo = process.env["ONER_OTP_INBOX_SECRET"] ?? process.env["OTP_INBOX_SECRET"];
        const enviado = request.headers.get("x-oner-secret") ?? url.searchParams.get("token") ?? "";
        if (!segredo || enviado !== segredo) return new Response("unauthorized", { status: 401 });

        const p = await lerCampos(request);
        const corpo = p["html"] ?? p["body"] ?? p["text"] ?? p["message"] ?? "";
        if (!corpo.trim()) return Response.json({ ok: false, motivo: "sem_conteudo" }, { status: 202 });

        const { registrarCodigoRecebido } = await import("@/lib/integrations/oner/otp.server");
        const r = await registrarCodigoRecebido({
          remetente: p["from"] ?? p["sender"] ?? "",
          assunto: p["subject"] ?? null,
          corpo,
          recebidoEm: p["date"] ?? p["received_at"] ?? null,
          messageId: p["message_id"] ?? p["messageid"] ?? null,
          origem: "email",
        });
        return Response.json(r, { status: r.ok ? 200 : 202 });
      },
      GET: async () => new Response("ok", { status: 200 }),
    },
  },
});
