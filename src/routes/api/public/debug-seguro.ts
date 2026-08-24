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

        const trecho = { De: de, Ate: ate, Cidade: { Id: cidadeId }, CidadeId: cidadeId, Destino: { Id: cidadeId } };
        const variantes: Record<string, any> = {
          Trechos: { ...body, Guid: guidCtx, Trechos: [trecho] },
          Destinos: { ...body, Guid: guidCtx, Destinos: [trecho] },
          Itinerario: { ...body, Guid: guidCtx, Itinerario: [trecho] },
          Viagens: { ...body, Guid: guidCtx, Viagens: [trecho] },
          Servicos: { ...body, Guid: guidCtx, Servicos: [trecho] },
          Passageiros: {
            ...body,
            Guid: guidCtx,
            Passageiros: [{ DataNascimento: "1990-01-01", Tipo: 0 }, { DataNascimento: "1990-01-01", Tipo: 0 }],
          },
          Carrinho: { ...body, Guid: guidCtx, Carrinho: { De: de, Ate: ate } },
        };
        const out: Record<string, any> = {};
        for (const [nome, b] of Object.entries(variantes)) {
          const r2 = await chamarCompreFacil(rota, { base, method: "POST", body: b });
          const dd: any = r2.dados;
          out[nome] = { ok: r2.ok, status: (r2 as any).status, msg: dd?.mensagem, itens: (dd?.Items ?? []).length, guid: dd?.MetaData?.Guid ?? null };
        }
        const r = await chamarCompreFacil(rota, { base, method: "POST", body: { ...body, Guid: guidCtx } });
        const d: any = r.dados;
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
