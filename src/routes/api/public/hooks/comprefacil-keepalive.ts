import { createFileRoute } from "@tanstack/react-router";

/**
 * Mantém a sessão da CompreFácil sempre válida.
 *
 * O token da operadora dura ~12h. Este hook roda de hora em hora via pg_cron e
 * refaz o login automaticamente quando falta menos de 60 min para expirar (ou
 * quando não existe sessão salva). Assim ninguém pega token vencido no meio de
 * uma busca.
 */
export const Route = createFileRoute("/api/public/hooks/comprefacil-keepalive")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let margemMinutos = 60;
        try {
          const body = (await request.json()) as { margemMinutos?: number } | null;
          if (body?.margemMinutos && Number.isFinite(body.margemMinutos)) {
            margemMinutos = Math.max(5, Math.min(360, Number(body.margemMinutos)));
          }
        } catch {
          /* sem corpo: usa o padrão */
        }

        try {
          const { renovarSessaoCompreFacil } = await import("@/lib/comprefacil/auth.server");
          const r = await renovarSessaoCompreFacil(margemMinutos);
          return Response.json({ ok: true, ...r });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("comprefacil-keepalive:", msg);
          return Response.json({ ok: false, erro: msg }, { status: 200 });
        }
      },
      GET: async () => {
        const { statusSessaoCompreFacil } = await import("@/lib/comprefacil/auth.server");
        return Response.json(await statusSessaoCompreFacil());
      },
    },
  },
});
