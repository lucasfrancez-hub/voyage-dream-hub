import { chamarCompreFacil } from "../../src/lib/comprefacil/auth.server";
const b0={Pagina:1,ItensPorPagina:5,Checkin:"2026-10-10",Checkout:"2026-10-30"};
const variants:any[]=[
 {...b0,CidadeId:558},
 {...b0,Quartos:[{Adultos:2,Criancas:[]}]},
 {...b0,CidadeId:377,Quartos:[{Adultos:2,Criancas:[]}]},
 {...b0,CidadeId:377,Apartamentos:[{Adultos:2,Criancas:[]}]},
 {...b0,CidadeDestinoId:377,CidadeSaidaId:558,Apartamentos:[{Adultos:2,Criancas:[]}]},
];
for(const b of variants){
 const r=await chamarCompreFacil("/api/pacote/busca",{method:"POST",body:b} as any);
 const d:any=r.dados;
 console.log("==",JSON.stringify(b).slice(0,150),r.ok,JSON.stringify(d).slice(0,400));
}
