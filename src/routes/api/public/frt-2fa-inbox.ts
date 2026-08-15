/**
 * Caixa de entrada dedicada ao 2FA da FRT.
 *
 * O e-mail da agência (Titan/HostGator) encaminha SOMENTE as mensagens de
 * código de verificação da FRT para este endpoint. Aqui o código é extraído,
 * guardado por poucos minutos e depois descartado.
 *
 * Regras:
 *  - exige o segredo compartilhado FRT_INBOUND_SECRET;
 *  - só aceita mensagens do remetente esperado (infotera/infotravel/frt);
 *  - o código NUNCA aparece em log.
 */
import { createFileRoute } from "@tanstack/react-router";

const REMETENTES_OK = /(infotera\.com\.br|infotravel\.com\.br|frt)/i;

function extrairCampos(texto: string) {
  return texto;
}

/** Procura o código numérico de 4 a 8 dígitos no corpo da mensagem. */
export function extrairCodigoFrt(texto: string): string | null {
  const limpo = texto.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ");
  const rotulado = limpo.match(
    /(?:c[óo]digo(?:\s+de\s+(?:verifica[çc][ãa]o|seguran[çc]a|acesso))?|token|c[óo]d\.?)\D{0,40}(\d{4,8})/i,
  );
  if (rotulado?.[1]) return rotulado[1];
  const solto = limpo.match(/\b(\d{6})\b/);
  return solto?.[1] ?? null;
}

async function lerPayload(request: Request): Promise<Record<string, string>> {
  const tipo = request.headers.get("content-type") ?? "";
  if (tipo.includes("application/json")) {
    const j = (await request.json()) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(j)) {
      if (typeof v === "string") out[k.toLowerCase()] = v;
    }
    return out;
  }
  if (tipo.includes("form")) {
    const f = await request.formData();
    const out: Record<string, string> = {};
    for (const [k, v] of f.entries()) if (typeof v === "string") out[k.toLowerCase()] = v;
    return out;
  }
  return { text: await request.text() };
}

export const Route = createFileRoute("/api/public/frt-2fa-inbox")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const segredo = process.env["FRT_INBOUND_SECRET"];
        const enviado =
          request.headers.get("x-frt-secret") ??
          new URL(request.url).searchParams.get("token") ??
          "";
        if (!segredo || enviado !== segredo) {
          return new Response("unauthorized", { status: 401 });
        }

        const p = await lerPayload(request);
        const remetente = p["from"] ?? p["sender"] ?? p["envelope_from"] ?? "";
        const assunto = p["subject"] ?? "";
        const corpo = extrairCampos(
          [p["text"], p["body-plain"], p["plain"], p["html"], p["body-html"], p["body"]]
            .filter(Boolean)
            .join("\n"),
        );

        // Só mensagens do remetente esperado (o encaminhamento pode reescrever
        // o From, então o assunto/corpo também valem como prova de origem).
        const daFrt =
          REMETENTES_OK.test(remetente) ||
          REMETENTES_OK.test(assunto) ||
          REMETENTES_OK.test(corpo.slice(0, 4000));
        if (!daFrt) {
          console.log("[FRT-2FA] mensagem ignorada (remetente fora do esperado)");
          return Response.json({ ok: false, motivo: "remetente_inesperado" }, { status: 202 });
        }

        const codigo = extrairCodigoFrt(`${assunto}\n${corpo}`);
        if (!codigo) {
          console.log("[FRT-2FA] mensagem recebida sem código identificável");
          return Response.json({ ok: false, motivo: "sem_codigo" }, { status: 202 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin.from("frt_auth_codes").insert({
          code: codigo,
          sender: remetente.slice(0, 200),
          subject: assunto.slice(0, 300),
        });
        // Limpeza: nada com mais de 1 hora precisa continuar guardado.
        await supabaseAdmin
          .from("frt_auth_codes")
          .delete()
          .lt("received_at", new Date(Date.now() - 60 * 60_000).toISOString());

        console.log("[FRT-2FA] código recebido e armazenado (valor não registrado)");
        return Response.json({ ok: true });
      },
      GET: async () => new Response("ok", { status: 200 }),
    },
  },
});
