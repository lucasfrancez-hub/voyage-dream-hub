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

        const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
        const buscaServico = async (tipo: number) => {
          const corpo = (g: string | null) => ({
            AgenciaId: Number(ses.agenciaId ?? 0),
            Guid: g,
            PacoteId: 0,
            Adt: 2,
            IdadesChd: [],
            De: de,
            Ate: ate,
            Cidade: { Id: cidadeId },
            TipoServico: tipo,
            ServicoExclusivo: false,
            BuscaEsim: false,
            EscreveLog: false,
            FiltroServico: { Ativo: null, Categoria: -1, TipoServico: "", Ordenacao: "", Tipo: "", Fornecedores: [] },
          });
          const rt = "/api/Servico/busca?Pagina=1&ItensPorPagina=40";
          const ini = await chamarCompreFacil(rt, { base, method: "POST", body: corpo(null) });
          const g = (ini.dados as any)?.MetaData?.Guid ?? null;
          let dd: any = ini.dados;
          if (g) {
            for (let k = 0; k < 6; k++) {
              await espera(2500);
              const rr = await chamarCompreFacil(rt, { base, method: "POST", body: corpo(g) });
              const it = ((rr.dados as any)?.Items ?? []) as any[];
              if (it.length >= ((dd?.Items ?? []) as any[]).length) dd = rr.dados;
              if (it.length) break;
            }
          }
          const its = ((dd?.Items ?? []) as any[]);
          return {
            total: its.length,
            tipos: [...new Set(its.map((x: any) => `${x?.TipoServico}:${x?.TipoServicoDesc}`))],
            seguros: its.filter((x: any) => /seguro|assist/i.test(String(x?.Titulo ?? ""))).slice(0, 3).map((x: any) => x?.Titulo),
          };
        };
        const out: Record<string, any> = {};
        for (const tipo of [0, 4, 5, 6]) out[`tipo${tipo}`] = await buscaServico(tipo);
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
