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
        // 1) inicia uma busca de serviços para obter um Guid de contexto
        const svc = await chamarCompreFacil("/api/Servico/busca?Pagina=1&ItensPorPagina=10", {
          base,
          method: "POST",
          body: {
            AgenciaId: Number(ses.agenciaId ?? 0),
            Guid: null,
            PacoteId: 0,
            Adt: 2,
            IdadesChd: [],
            De: de,
            Ate: ate,
            Cidade: { Id: cidadeId },
            TipoServico: 0,
            ServicoExclusivo: false,
            BuscaEsim: false,
            EscreveLog: false,
            FiltroServico: { Ativo: null, Categoria: -1, TipoServico: "", Ordenacao: "", Tipo: "", Fornecedores: [] },
          },
        });
        const guidCtx = (svc.dados as any)?.MetaData?.Guid ?? null;

        const out: Record<string, any> = {};
        const fmts: Record<string, [string, string]> = {
          br: ["05/11/2026", "12/11/2026"],
          brHora: ["05/11/2026 00:00", "12/11/2026 00:00"],
          isoT: ["2026-11-05T12:00:00", "2026-11-12T12:00:00"],
          isoZ: ["2026-11-05T12:00:00.000Z", "2026-11-12T12:00:00.000Z"],
          usa: ["11/05/2026", "11/12/2026"],
          net: ["2026-11-05T00:00:00-03:00", "2026-11-12T00:00:00-03:00"],
        };
        for (const [nome, [a, b]] of Object.entries(fmts)) {
          const r2 = await chamarCompreFacil(rota, { base, method: "POST", body: { ...body, De: a, Ate: b } });
          const dd: any = r2.dados;
          out[nome] = { status: (r2 as any).status, msg: dd?.mensagem, guid: dd?.MetaData?.Guid ?? null, itens: (dd?.Items ?? []).length };
        }
        const r = { ok: false } as any;
        const d: any = {};
        return Response.json({ out, base: { ok: r.ok, msg: d?.mensagem } });
        // eslint-disable-next-line no-unreachable
        return Response.json({
          cidadeId,
          amostraCidade: alvo ?? null,
          guidCtx,
          svcOk: svc.ok,
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
