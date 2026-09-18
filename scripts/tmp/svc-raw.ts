import { chamarCompreFacil, COMPREFACIL_BASES, sessaoCompreFacil } from "@/lib/comprefacil/auth.server";
const ses = await sessaoCompreFacil();
const base = COMPREFACIL_BASES.servico;
const corpo = (guid: string | null) => ({
  AgenciaId: Number(ses.agenciaId ?? 0), Guid: guid, PacoteId: 0, Adt: 2, IdadesChd: [],
  De: "2026-11-10", Ate: "2026-11-14", Cidade: { Id: Number(process.env.CID || 0) }, TipoServico: 0,
  ServicoExclusivo: false, BuscaEsim: false, EscreveLog: false,
  FiltroServico: { Ativo: null, Categoria: -1, TipoServico: "", Ordenacao: "", Tipo: "", Fornecedores: [] },
});
const r0 = await chamarCompreFacil("/api/Servico/busca?Pagina=1&ItensPorPagina=50", { base, method: "POST", body: corpo(null) });
const guid = (r0.dados as any)?.MetaData?.Guid;
console.log("guid?", Boolean(guid));
let itens: any[] = [];
for (let i = 0; i < 20 && itens.length === 0; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  const r = await chamarCompreFacil("/api/Servico/busca?Pagina=1&ItensPorPagina=50", { base, method: "POST", body: corpo(guid) });
  itens = ((r.dados as any)?.Items ?? []) as any[];
}
console.log("itens", itens.length);
const it = itens[0];
if (it) {
  console.log("CHAVES:", Object.keys(it).join(","));
  const interesse = Object.fromEntries(Object.entries(it).filter(([k]) => /valor|comiss|markup|taxa|moeda|incentiv|over|desconto|lucro/i.test(k)));
  console.log(JSON.stringify(interesse, null, 1));
  const t = (it.Tarifas ?? [])[0];
  if (t) console.log("TARIFA CHAVES:", Object.keys(t).join(","), JSON.stringify(Object.fromEntries(Object.entries(t).filter(([k]) => /valor|comiss|markup|taxa|incentiv|over/i.test(k))), null, 1));
}
