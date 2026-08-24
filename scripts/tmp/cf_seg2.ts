import { chamarCompreFacil, COMPREFACIL_BASES, sessaoCompreFacil } from "../../src/lib/comprefacil/auth.server";
const ses = await sessaoCompreFacil();
const base = COMPREFACIL_BASES.servico;
const rota = "/api/Seguro/busca?Pagina=1&ItensPorPagina=40";
const corpo = (guid: string|null) => ({AgenciaId:Number(ses.agenciaId??0),Guid:guid,Adt:2,Chd:0,Snr:0,IdadesAdt:[18,18],IdadesChd:[],DestinoCodigo:12,Partida:"2026-09-20",Retorno:"2026-09-25",EscreveLog:false});
const ini = await chamarCompreFacil(rota,{base,method:"POST",body:corpo(null)});
const guid=(ini.dados as any)?.MetaData?.Guid;
let d:any=ini.dados;
for(let i=0;i<8;i++){await new Promise(r=>setTimeout(r,2000));const r=await chamarCompreFacil(rota,{base,method:"POST",body:corpo(guid)});const it=((r.dados as any)?.Items??[]);if(it.length){d=r.dados;break;}}
const it=(d?.Items??[])[0];
const tent = [
  ["GET",`/api/Seguro/${it.Id}`],
  ["GET",`/api/Seguro/detalhe/${it.Id}`],
  ["GET",`/api/Seguro/coberturas/${it.Id}`],
  ["GET",`/api/Seguro/cobertura?Codigo=${it.Codigo}&TarifaCodigo=${it.TarifaCodigo}`],
  ["POST","/api/Seguro/detalhe"],
  ["POST","/api/Seguro/detalhes"],
  ["POST","/api/Seguro/coberturas"],
];
for(const [m,r] of tent as any[]){
  const res = await chamarCompreFacil(r,{base,method:m,body:m==="POST"?{...it,Guid:guid,AgenciaId:Number(ses.agenciaId??0)}:undefined});
  const s=JSON.stringify(res.dados??"").slice(0,300);
  console.log(m,r,res.status,res.ok,s.slice(0,280));
}
