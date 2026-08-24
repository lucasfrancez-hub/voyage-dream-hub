import { chamarCompreFacil, COMPREFACIL_BASES, sessaoCompreFacil } from "../../src/lib/comprefacil/auth.server";
const ses = await sessaoCompreFacil();
const base = COMPREFACIL_BASES.hotel;
const rota = `/api/Hotel/buscaasync?Pagina=1&ItensPorPagina=20`;
const corpo = (guid: string | null, ordenacao = "") => ({
  AgenciaId: Number(ses.agenciaId ?? 0), Guid: guid, Nacionalidade: "BR", PacoteId: 0, EventoId: 0,
  SomentePromocao: false, BuscaPacote: true, BuscaEvento: false, FiltrarEstrelasWebService: false, EscreveLog: false,
  Checkin: "2026-10-10", Checkout: "2026-10-14", Cidade: { Id: 4813 },
  Quartos: [{ NumeroPesquisa: 1, Qtde: 1, Adultos: 2, Criancas: [] }],
  FiltroHotel: { EstrelasMinimo: 0, EstrelasMaximo: 5, Fornecedores: [], Reembolsavel: -1, Pensao: [], Pensoes: [], Ordenacao: ordenacao },
});
const ini = await chamarCompreFacil(rota, { base, method: "POST", body: corpo(null) });
const guid = (ini.dados as any)?.MetaData?.Guid;
console.log("guid", guid);
let dados: any = ini.dados;
for (let i = 0; i < 8; i++) {
  await new Promise(r => setTimeout(r, 2500));
  const r = await chamarCompreFacil(rota, { base, method: "POST", body: corpo(guid, "asc") });
  dados = r.dados;
  console.log("itens", (dados?.Items ?? []).length, "meta", JSON.stringify(dados?.MetaData).slice(0,200));
  if ((dados?.Items ?? []).length) break;
}
const it = (dados?.Items ?? [])[0];
console.log("KEYS", Object.keys(it ?? {}));
console.log(JSON.stringify(it, null, 1).slice(0, 6000));
