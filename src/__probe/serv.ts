import { chamarCompreFacil, COMPREFACIL_BASES, sessaoCompreFacil } from "../lib/comprefacil/auth.server";
import { cidadesOficiaisCF } from "../lib/comprefacil/localidades.server";
const id = (await cidadesOficiaisCF()).find(c=>/lisboa/i.test(c.nome))!.id;
const ses = await sessaoCompreFacil();
const base = COMPREFACIL_BASES.servico;
const corpo=(guid:string|null)=>({AgenciaId:Number(ses.agenciaId??0),Guid:guid,PacoteId:0,Adt:2,IdadesChd:[],De:"2027-01-13",Ate:"2027-01-24",Cidade:{Id:id},TipoServico:0,ServicoExclusivo:false,BuscaEsim:false,EscreveLog:false,FiltroServico:{Ativo:null,Categoria:-1,TipoServico:"",Ordenacao:"",Tipo:"",Fornecedores:[]}});
const rota="/api/Servico/busca?Pagina=1&ItensPorPagina=50";
const ini=await chamarCompreFacil(rota,{base,method:"POST",body:corpo(null)});
const guid=(ini.dados as any)?.MetaData?.Guid; let d:any=ini.dados;
for(let i=0;i<12;i++){await new Promise(r=>setTimeout(r,2500));const r=await chamarCompreFacil(rota,{base,method:"POST",body:corpo(guid)});const l=(r.dados as any)?.Items??[];if(l.length){d=r.dados;break;}}
const its=(d?.Items??[]) as any[];
console.log("total",its.length);
const chaves = new Set<string>(); for(const s of its) Object.keys(s).forEach(k=>chaves.add(k));
console.log([...chaves].join(", "));
const s0=its[0];
console.log(JSON.stringify(s0,null,1).slice(0,4000));
