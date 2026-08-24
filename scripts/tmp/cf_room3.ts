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
  const a = dados?.MetaData?.BuscasAtivas;
  if (!a || a === "null" || a === "[]") break;
}
for (const it of (dados?.Items ?? []).slice(0, 4)) {
  console.log("==", it.Nome, it.Fornecedor);
  for (const q of (it.Quartos ?? []).slice(0, 6))
    console.log("   ", JSON.stringify({d:q.Descricao, p:q.DescricaoPensao, po:q.DescricaoPensaoOriginal, v:q.ValorVenda, l:q.ValorListagem, ad:q.Adultos}));
}
