import { chamarCompreFacil, COMPREFACIL_BASES, sessaoCompreFacil } from "../../src/lib/comprefacil/auth.server";
const ses = await sessaoCompreFacil();
const base = COMPREFACIL_BASES.hotel;
const rota = `/api/Hotel/buscaasync?Pagina=1&ItensPorPagina=20`;
const corpo = (guid: string | null, ordenacao = "") => ({
  AgenciaId: Number(ses.agenciaId ?? 0), Guid: guid, Nacionalidade: "BR", PacoteId: 0, EventoId: 0,
  SomentePromocao: false, BuscaPacote: true, BuscaEvento: false, FiltrarEstrelasWebService: false, EscreveLog: false,
  Checkin: "2026-10-10", Checkout: "2026-10-14", Cidade: { Id: 365 },
  Quartos: [{ NumeroPesquisa: 1, Qtde: 1, Adultos: 2, Criancas: [] }],
  FiltroHotel: { EstrelasMinimo: 0, EstrelasMaximo: 5, Fornecedores: [], Reembolsavel: -1, Pensao: [], Pensoes: [], Ordenacao: ordenacao },
});
const ini = await chamarCompreFacil(rota, { base, method: "POST", body: corpo(null) });
const guid = (ini.dados as any)?.MetaData?.Guid;
let dados: any;
for (let i = 0; i < 10; i++) {
  await new Promise(r => setTimeout(r, 3000));
  const r = await chamarCompreFacil(rota, { base, method: "POST", body: corpo(guid, "asc") });
  dados = r.dados;
  const items = dados?.Items ?? [];
  console.log(i, "itens", items.length, "ativas", dados?.MetaData?.BuscasAtivas, "quartos[0]", (items[0]?.Quartos ?? []).length);
  if (!dados?.MetaData?.BuscasAtivas || dados.MetaData.BuscasAtivas === "null" || dados.MetaData.BuscasAtivas === "[]") break;
}
const it = (dados?.Items ?? [])[0];
console.log("hotel", it?.Nome, it?.Fornecedor, it?.CodigoFornecedor, it?.Id, it?.AgrupadorFornecedor);
console.log("QUARTO KEYS", Object.keys(it?.Quartos?.[0] ?? {}).join(","));
// tenta endpoints de detalhe
const tentativas = [
  ["/api/Hotel/quartos", { Guid: guid, AgenciaId: Number(ses.agenciaId??0), Hotel: it }],
  ["/api/Hotel/detalhe", { Guid: guid, AgenciaId: Number(ses.agenciaId??0), Hotel: it }],
  ["/api/Hotel/buscaquartos", { Guid: guid, AgenciaId: Number(ses.agenciaId??0), Hotel: it }],
  ["/api/Hotel/opcoes", { Guid: guid, AgenciaId: Number(ses.agenciaId??0), Hotel: it }],
  ["/api/Hotel/detalhes", { Guid: guid, AgenciaId: Number(ses.agenciaId??0), Hotel: it }],
];
for (const [r, body] of tentativas as any[]) {
  try {
    const resp = await chamarCompreFacil(r, { base, method: "POST", body });
    console.log("OK", r, JSON.stringify(resp.dados).slice(0, 500));
  } catch (e) { console.log("ERR", r, String(e).slice(0,120)); }
}
