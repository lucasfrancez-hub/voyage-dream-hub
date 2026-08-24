import { chamarCompreFacil } from "../../src/lib/comprefacil/auth.server";
const B="https://apihotel.comprefacil.tur.br";
let all:any[]=[];
for(let p=1;p<=19;p++){const r=await chamarCompreFacil(`/api/aeroporto?Pagina=${p}&ItensPorPagina=50`,{base:B} as any);const d:any=r.dados;all=all.concat(d?.Items??[]);}
console.log("total",all.length);
const br=all.filter(a=>/maring|palmas|paranava|londrina/i.test(a.Descricao+" "+(a.Cidade?.Nome??"")));
console.log(JSON.stringify(br.map(a=>({d:a.Descricao,iata:a.Iata,cid:a.CidadeId,nome:a.Cidade?.Nome}))));
const r2=await chamarCompreFacil("/api/pacote?Pagina=1&ItensPorPagina=3&CidadeId=356");
console.log("porCidadeId",(r2.dados as any)?.MetaData?.TotalItens,((r2.dados as any)?.Items??[]).map((i:any)=>i.Cidade?.Nome??i.Cidade));
