import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/debug-seguro")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const u = new URL(request.url);
        if (u.searchParams.get("k") !== "viaair-debug") return new Response("no", { status: 401 });
        const { chamarCompreFacil, COMPREFACIL_BASES, sessaoCompreFacil } = await import(
          "@/lib/comprefacil/auth.server"
        );
        const { cidadesOficiaisCF } = await import("@/lib/comprefacil/localidades.server");
        const ses = await sessaoCompreFacil();
        const base = COMPREFACIL_BASES.servico;
        const rota = "/api/Seguro/busca?Pagina=1&ItensPorPagina=40";

        const cidades = await cidadesOficiaisCF().catch(() => []);
        const alvo =
          cidades.find((c: any) => /maceio|maceió/i.test(String(c?.nome ?? ""))) ?? cidades[0];
        const cidadeId = Number(u.searchParams.get("cidade") ?? (alvo as any)?.id ?? 0);

        const de = u.searchParams.get("de") ?? "2026-10-10";
        const ate = u.searchParams.get("ate") ?? "2026-10-15";
        const body = {
          AgenciaId: Number(ses.agenciaId ?? 0),
          Guid: null,
          PacoteId: 0,
          Adt: 2,
          IdadesChd: [],
          De: de,
          Ate: ate,
          Cidade: { Id: cidadeId },
          Internacional: false,
          EscreveLog: false,
        };
        const r = await chamarCompreFacil(rota, { base, method: "POST", body });
        const d: any = r.dados;
        return Response.json({
          cidadeId,
          amostraCidade: alvo ?? null,
          ok: r.ok,
          status: (r as any).status,
          msg: d?.mensagem,
          guid: d?.MetaData?.Guid ?? null,
          itens: (d?.Items ?? d?.Itens ?? []).length,
          primeiro: (d?.Items ?? d?.Itens ?? [])[0] ?? null,
        });
      },
    },
  },
});
