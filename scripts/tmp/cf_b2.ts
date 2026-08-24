import { chamarCompreFacil } from "../../src/lib/comprefacil/auth.server";
const bodies:any[] = [
 {},
 {Pagina:1,ItensPorPagina:5},
 {Pagina:1,ItensPorPagina:5,CidadeId:558},
 {Pagina:1,ItensPorPagina:5,CidadeSaidaId:558,DataDe:"2026-10-10",DataAte:"2026-10-30"},
];
for(const b of bodies){
 const r = await chamarCompreFacil("/api/pacote/busca",{method:"POST",body:b} as any);
 const d:any=r.dados;
 console.log("==",JSON.stringify(b),r.ok,JSON.stringify(d?.MetaData??d).slice(0,300));
 if(d?.Items?.[0]) console.log("   sample", d.Items[0].Nome, d.Items[0].Cidade?.Nome??d.Items[0].Cidade, "saida?", Object.keys(d.Items[0]).filter(k=>/said|origem|embarq/i.test(k)));
}
