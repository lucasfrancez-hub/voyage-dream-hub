import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/cf-probe")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("k") !== "viaair-probe") return new Response("no", { status: 404 });
        const { probeCidadesCompreFacil } = await import("@/lib/comprefacil/probe.functions");
        const dados = await probeCidadesCompreFacil();
        return Response.json(dados);
      },
    },
  },
});
