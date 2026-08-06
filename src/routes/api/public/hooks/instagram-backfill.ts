import { createFileRoute } from "@tanstack/react-router";

/**
 * Importação retroativa do Instagram (DMs + comentários) de uma conta.
 * Uso interno/manual: POST { conta: "lucasfrancez", paginas: 4 }.
 * Não aciona a IA.
 */
export const Route = createFileRoute("/api/public/hooks/instagram-backfill")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as {
            conta?: string;
            paginas?: number;
            espelhar?: boolean;
          };
          if (!body.conta) return Response.json({ ok: false, error: "Informe 'conta'" }, { status: 400 });
          const { backfillInstagramAccount } = await import("@/lib/instagram/backfill.server");
          const resultado = await backfillInstagramAccount({
            conta: body.conta,
            paginas: body.paginas,
            espelhar: body.espelhar,
          });
          return Response.json({ ok: true, ...resultado });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error("[instagram-backfill]", message);
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
    },
  },
});
