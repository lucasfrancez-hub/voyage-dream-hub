import { chamarCompreFacil, COMPREFACIL_BASES, sessaoCompreFacil } from "../../src/lib/comprefacil/auth.server";
const ses = await sessaoCompreFacil();
const base = COMPREFACIL_BASES.servico;
const id=241947, cod="B51", tar="43780", forn="AC", ws=238;
const tent = [
 `/api/Seguro/detalhe`,
 `/api/Seguro/detalhe?Id=${id}`,
 `/api/Seguro/detalhe?id=${id}`,
 `/api/Seguro/coberturas?Id=${id}`,
 `/api/Seguro/coberturas?Codigo=${cod}&Fornecedor=${forn}&WebServiceId=${ws}`,
 `/api/Seguro/detalhe?Codigo=${cod}&TarifaCodigo=${tar}&WebServiceId=${ws}&Fornecedor=${forn}`,
 `/api/Seguro/planos`,
 `/api/Seguro/fornecedores`,
 `/api/Seguro/destinos`,
];
for(const r of tent){
  const res = await chamarCompreFacil(r,{base});
  console.log(r, res.status, JSON.stringify(res.dados??"").slice(0,400).replace(/\n/g," "));
}
