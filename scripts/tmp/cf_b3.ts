import { chamarCompreFacil } from "../../src/lib/comprefacil/auth.server";
const base={Pagina:1,ItensPorPagina:5};
const variants:any[]=[
 {...base,DataIda:"2026-10-10",DataVolta:"2026-10-30"},
 {...base,DataInicio:"2026-10-10",DataFim:"2026-10-30"},
 {...base,Checkin:"2026-10-10",Checkout:"2026-10-30"},
 {...base,DataSaida:"2026-10-10",DataRetorno:"2026-10-30"},
 {...base,PeriodoDe:"2026-10-10",PeriodoAte:"2026-10-30"},
 {...base,ValidadeDe:"2026-10-10",ValidadeAte:"2026-10-30"},
 {...base,DataDe:"2026-10-10T00:00:00",DataAte:"2026-10-30T00:00:00"},
 {...base,DataIda:"2026-10-10T00:00:00"},
];
for(const b of variants){
 const r=await chamarCompreFacil("/api/pacote/busca",{method:"POST",body:b} as any);
 const d:any=r.dados;
 console.log("==",JSON.stringify(b).slice(0,120),r.ok,JSON.stringify(d).slice(0,250));
}
