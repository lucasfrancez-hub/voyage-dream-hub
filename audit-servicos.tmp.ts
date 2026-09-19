/** TEMPORÁRIO — auditoria de tempos da busca de serviços. Apagar após uso. */
const destinos = process.argv.slice(2);

const chamadas: { url: string; ms: number; ok: boolean; kb: number }[] = [];
const origFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = typeof input === "string" ? input : (input?.url ?? String(input));
  const t0 = Date.now();
  try {
    const r = await origFetch(input, init);
    const clone = r.clone();
    const txt = await clone.text().catch(() => "");
    chamadas.push({ url, ms: Date.now() - t0, ok: r.ok, kb: Math.round((txt.length / 1024) * 10) / 10 });
    return r;
  } catch (e) {
    chamadas.push({ url, ms: Date.now() - t0, ok: false, kb: 0 });
    throw e;
  }
}) as typeof fetch;

const dataIda = new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10);
const dataVolta = new Date(Date.now() + 50 * 86400000).toISOString().slice(0, 10);

const { buscarServicos } = await import("@/lib/services/comprefacil-services.server");

for (const destino of destinos) {
  chamadas.length = 0;
  const t0 = Date.now();
  let erro: string | null = null;
  let res: any = null;
  try {
    res = await buscarServicos(
      { destino, data: dataIda, dataFim: dataVolta, adultos: 2 } as any,
      null,
    );
  } catch (e) {
    erro = e instanceof Error ? e.message : String(e);
  }
  const total = Date.now() - t0;
  const somaRede = chamadas.reduce((a, c) => a + c.ms, 0);
  const kb = res ? Math.round((JSON.stringify(res).length / 1024) * 10) / 10 : 0;
  console.log(
    JSON.stringify({
      destino,
      total_ms: total,
      erro,
      chamadas_n: chamadas.length,
      soma_rede_ms: somaRede,
      resposta_kb: kb,
      resultados: res?.total ?? 0,
      por_tipo: res?.por_tipo ?? {},
      detalhe: chamadas.map((c) => ({
        rota: c.url.replace(/^https?:\/\/[^/]+/, "").slice(0, 60),
        ms: c.ms,
        ok: c.ok,
        kb: c.kb,
      })),
    }),
  );
}
