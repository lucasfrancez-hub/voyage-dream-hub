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
        const ses = await sessaoCompreFacil();
        const base = COMPREFACIL_BASES.servico;
        const rota = "/api/Seguro/busca?Pagina=1&ItensPorPagina=40";
        const de = u.searchParams.get("de") ?? "2026-10-10";
        const ate = u.searchParams.get("ate") ?? "2026-10-15";
        const cidade = Number(u.searchParams.get("cidade") ?? 1);
        const comum = {
          AgenciaId: Number(ses.agenciaId ?? 0),
          Guid: null,
          PacoteId: 0,
          Adt: 2,
          IdadesChd: [],
          EscreveLog: false,
        };
        const variantes: Record<string, any> = {
          v1_de_ate: { ...comum, De: de, Ate: ate, Cidade: { Id: cidade }, Internacional: false },
          v2_datas: {
            ...comum,
            DataInicio: de,
            DataFim: ate,
            Cidade: { Id: cidade },
            Internacional: false,
          },
          v3_ida_volta: {
            ...comum,
            DataIda: de,
            DataVolta: ate,
            Cidade: { Id: cidade },
            Internacional: false,
          },
          v4_iso: {
            ...comum,
            De: `${de}T00:00:00`,
            Ate: `${ate}T00:00:00`,
            Cidade: { Id: cidade },
            Internacional: false,
          },
          v6_embarque: {
            ...comum,
            DataEmbarque: de,
            DataDesembarque: ate,
            Cidade: { Id: cidade },
            Internacional: false,
          },
          v7_periodo: {
            ...comum,
            Ida: de,
            Volta: ate,
            Cidade: { Id: cidade },
            Internacional: false,
          },
          v8_vazio: { ...comum },
          v5_destino: {
            ...comum,
            De: de,
            Ate: ate,
            Destinos: [{ Id: cidade }],
            Cidade: { Id: cidade },
            Internacional: false,
          },
        };
        const out: Record<string, any> = {};
        const body = { ...comum, Cidade: { Id: cidade }, De: de, Ate: ate, Internacional: false };
        const rotas: Record<string, string> = {
          qs_de_ate: `/api/Seguro/busca?Pagina=1&ItensPorPagina=40&De=${de}&Ate=${ate}`,
          qs_datas: `/api/Seguro/busca?Pagina=1&ItensPorPagina=40&DataInicio=${de}&DataFim=${ate}`,
          qs_br: `/api/Seguro/busca?Pagina=1&ItensPorPagina=40&De=10/10/2026&Ate=15/10/2026`,
        };
        for (const [nome, rt] of Object.entries(rotas)) {
          const r = await chamarCompreFacil(rt, { base, method: "POST", body });
          const d: any = r.dados;
          out[nome] = { ok: r.ok, status: (r as any).status, msg: d?.mensagem, guid: d?.MetaData?.Guid ?? null, itens: (d?.Items ?? []).length };
        }
        return Response.json(out);
      },
    },
  },
});
