import { chamarCompreFacil, COMPREFACIL_BASES, sessaoCompreFacil } from "../../src/lib/comprefacil/auth.server";
const ses = await sessaoCompreFacil();
const base = COMPREFACIL_BASES.servico;
const rota = "/api/Seguro/busca?Pagina=1&ItensPorPagina=40";
const corpo = (guid: string|null) => ({AgenciaId:Number(ses.agenciaId??0),Guid:guid,Adt:2,Chd:0,Snr:0,IdadesAdt:[18,18],IdadesChd:[],DestinoCodigo:1,Partida:"2026-09-20",Retorno:"2026-09-25",EscreveLog:false});
const ini = await chamarCompreFacil(rota,{base,method:"POST",body:corpo(null)});
const guid=(ini.dados as any)?.MetaData?.Guid;
let d:any=ini.dados;
for(let i=0;i<10;i++){await new Promise(r=>setTimeout(r,2000));const r=await chamarCompreFacil(rota,{base,method:"POST",body:corpo(guid)});const it=((r.dados as any)?.Items??[]);if(it.length)d=r.dados;if(it.length&&!(((r.dados as any)?.MetaData?.BuscasAtivas??"[]").length>2))break;}
const items=(d?.Items??d?.Itens??[]);
console.log("total",items.length);
console.log(JSON.stringify(items,null,1).slice(0,4000));
