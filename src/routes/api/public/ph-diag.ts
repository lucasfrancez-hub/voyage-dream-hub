import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/ph-diag")({
  server: {
    handlers: {
      GET: async () => {
        const { passhubBuscarVoos } = await import("@/lib/passhub/search.server");
        const r = await passhubBuscarVoos({
          trechos: [{ origem: "GRU", destino: "REC", data: "2026-10-15" }],
          adultos: 1,
        });
        return Response.json(r);
      },
    },
  },
});
