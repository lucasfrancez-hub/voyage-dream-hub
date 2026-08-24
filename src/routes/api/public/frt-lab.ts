/**
 * TEMPORÁRIO — laboratório de descoberta da API de reserva da FRT/CompreFácil.
 * Só responde em desenvolvimento (localhost) e exige o header `x-lab-key`.
 * Deve ser removido quando o fluxo de reserva estiver mapeado.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/frt-lab")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const host = new URL(request.url).hostname;
        if (host !== "localhost" && host !== "127.0.0.1") {
          return new Response("Not found", { status: 404 });
        }
        const chave = process.env["FRT_LAB_KEY"] ?? "lab-local-2026";
        if (request.headers.get("x-lab-key") !== chave) {
          return new Response("Unauthorized", { status: 401 });
        }
        const body = (await request.json()) as {
          path: string;
          base?: "principal" | "aereo" | "hotel" | "servico";
          method?: string;
          payload?: unknown;
        };
        const { chamarCompreFacil, COMPREFACIL_BASES } = await import("@/lib/comprefacil/auth.server");
        const r = await chamarCompreFacil(body.path, {
          base: COMPREFACIL_BASES[body.base ?? "principal"],
          method: body.method ?? "GET",
          ...(body.payload === undefined ? {} : { body: body.payload }),
        });
        return Response.json({ status: r.status, ok: r.ok, dados: r.dados });
      },
    },
  },
});
