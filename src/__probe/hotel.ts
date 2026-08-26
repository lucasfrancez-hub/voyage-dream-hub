import { chamarCompreFacil, COMPREFACIL_BASES, sessaoCompreFacil } from "../lib/comprefacil/auth.server";
import { cidadesOficiaisCF } from "../lib/comprefacil/localidades.server";
const cid = (await cidadesOficiaisCF()).filter(c=>/lisboa/i.test(c.nome));
console.log(cid.slice(0,5));
const ses = await sessaoCompreFacil();
const id = cid[0]!.id;
const corpo = (guid:string|null)=>({AgenciaId:Number(ses.agenciaId??0),Guid:guid,Nacionalidade:"BR",PacoteId:0,EventoId:0,SomentePromocao:false,BuscaPacote:true,BuscaEvento:false,FiltrarEstrelasWebService:false,EscreveLog:false,Checkin:"2027-01-13",Checkout:"2027-01-24",Cidade:{Id:id},Quartos:[{NumeroPesquisa:1,Qtde:1,Adultos:2,Criancas:[]}],FiltroHotel:{EstrelasMinimo:0,EstrelasMaximo:5,Fornecedores:[],Reembolsavel:-1,Pensao:[],Pensoes:[],Ordenacao:""}});
const rota = "/api/Hotel/buscaasync?Pagina=1&ItensPorPagina=60";
const base = COMPREFACIL_BASES.hotel;
const ini = await chamarCompreFacil(rota,{base,method:"POST",body:corpo(null)});
const guid=(ini.dados as any)?.MetaData?.Guid; let d:any=ini.dados;
for(let i=0;i<12;i++){await new Promise(r=>setTimeout(r,2000));const r=await chamarCompreFacil(rota,{base,method:"POST",body:corpo(guid)});const its=(r.dados as any)?.Items??[];if(its.some((h:any)=>(h.Quartos??[]).some((q:any)=>q?.Descricao))){d=r.dados;break;}}
const items=(d?.Items??[]) as any[];
const h = items.find((x)=>/fenix garden/i.test(x?.Nome??"")) ?? items[0];
console.log("HOTEL", h?.Nome);
console.log(JSON.stringify(Object.fromEntries(Object.entries(h??{}).filter(([k,v])=>typeof v!=="object")),null,1));
console.log("QUARTO", JSON.stringify((h?.Quartos??[])[0],null,1).slice(0,3000));
