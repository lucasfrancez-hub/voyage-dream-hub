import { chamarCompreFacil } from "../../src/lib/comprefacil/auth.server";
const q = ["/api/offlineservicofornecedor?Pagina=1&ItensPorPagina=5","/api/offlineservicofornecedor?CidadeId=349&Pagina=1&ItensPorPagina=5","/api/offlineservico?FornecedorCidadeId=349&Pagina=1&ItensPorPagina=3","/api/offlineservico?OfflineServicoFornecedorId=38&Pagina=1&ItensPorPagina=3"];
for (const c of q) {
  const r = await chamarCompreFacil(c);
  const d: any = r.dados;
  console.log(c, r.status, d?.MetaData?.TotalItens, JSON.stringify(d?.Items?.[0] ?? {}).slice(0,300));
}
