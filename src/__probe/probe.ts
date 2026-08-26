import { buscarAereoDinamicoCF } from "../lib/comprefacil/dinamico.server";
import { chamarCompreFacil, COMPREFACIL_BASES, sessaoCompreFacil } from "../lib/comprefacil/auth.server";
const ses = await sessaoCompreFacil();
const body = (guid: string|null) => ({ Adt:2, Chd:0, Inf:0, AgenciaId:Number(ses.agenciaId??0), TipoBusca:"ida-volta", ...(guid?{Guid:guid}:{}) ,
 SegmentosBusca:[{AeroportoPartida:"MAO",AeroportoChegada:"LIS",PaisChegada:null,DataPartida:"2027-01-13"},{AeroportoPartida:"LIS",AeroportoChegada:"MAO",PaisChegada:null,DataPartida:"2027-01-24"}],
 FiltroAereo:{HorarioIdaMinimo:0,HorarioIdaMaximo:23,HorarioVoltaMinimo:0,HorarioVoltaMaximo:23,Cias:[],Aeroportos:[],Bagagem:-1,TodasFamilias:true,Fornecedores:[],Familia:[],MinimoDuracaoTrechos:[],MaximoDuracaoTrechos:[],NumeroParadasIda:-1,NumeroParadasVolta:-1,Ordenacao:"asc"}});
const rota = "/api/Aereo/busca?Pagina=1&ItensPorPagina=20";
const base = COMPREFACIL_BASES.aereo;
const ini = await chamarCompreFacil(rota,{base,method:"POST",body:body(null)});
const guid = (ini.dados as any)?.Aereos?.MetaData?.Guid;
let d:any = ini.dados;
for (let i=0;i<10;i++){ await new Promise(r=>setTimeout(r,2000)); const r = await chamarCompreFacil(rota,{base,method:"POST",body:body(guid)}); if(((r.dados as any)?.Aereos?.Items??[]).length) { d=r.dados; break; } }
const it = (d?.Aereos?.Items??[])[0];
console.log(JSON.stringify({keys:Object.keys(it??{}), paxes: it?.PaxesTarifa, moeda: it?.Moeda, taxa: it?.Taxa, item: Object.fromEntries(Object.entries(it??{}).filter(([k,v])=>typeof v!=="object"))},null,2));
