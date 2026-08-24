import { chamarCompreFacil } from "../../src/lib/comprefacil/auth.server";
const tests:any[]=[
 ["/api/Pacote/list?Pagina=1&ItensPorPagina=5",{Busca:"maringa",Datain:"2026-10-10",Dataout:"2026-10-30"}],
 ["/api/Pacote/list?Pagina=1&ItensPorPagina=5",{Busca:"",Datain:"2026-10-10",Dataout:"2026-10-30"}],
 ["/api/Pacote/list?Pagina=1&ItensPorPagina=5",{Busca:"caldas",Datain:"",Dataout:""}],
];
for(const [p,b] of tests){
 const r=await chamarCompreFacil(p,{method:"POST",body:b} as any);
 const d:any=r.dados;
 console.log("==",JSON.stringify(b),r.ok,JSON.stringify(d?.MetaData??d).slice(0,250));
 if(d?.Items?.length) console.log("   ex:",d.Items.slice(0,3).map((i:any)=>[i.Nome?.slice(0,40),i.Cidade?.Nome??i.Cidade,i.CidadeId]));
}
