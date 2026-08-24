import { chamarCompreFacil } from "../../src/lib/comprefacil/auth.server";
const B="https://apihotel.comprefacil.tur.br";
const paths=["/api/aeroporto?Descricao=maring","/api/aeroporto?Nome=maring","/api/aeroporto?Filtro=maring","/api/aeroporto?Pesquisa=maring","/api/cidade?Pagina=1&ItensPorPagina=5","/api/cidade?Descricao=maring","/api/pais?Pagina=1&ItensPorPagina=3","/api/estado?Pagina=1&ItensPorPagina=3"];
for(const p of paths){ try{const r=await chamarCompreFacil(p,{base:B} as any); const d:any=r.dados; console.log("==",p,r.ok,d?.MetaData?.TotalItens, JSON.stringify(d?.Items?.slice(0,2)??d).slice(0,250));}catch(e){} }
