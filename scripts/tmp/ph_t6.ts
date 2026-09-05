import { passhubBuscarVoos } from "../../src/lib/passhub/search.server";
import { normalizaBuscaPassHub } from "../../src/lib/passhub/normalize.server";
import { passhubRequest, passhubBases } from "../../src/lib/passhub/client.server";
const d1=new Date(Date.now()+40*86400000).toISOString().slice(0,10);
const n:any=normalizaBuscaPassHub(await passhubBuscarVoos({trechos:[{origem:"GRU",destino:"REC",data:d1}],adultos:1}),0);
const of=n.ofertas[0];
for (const body of [
  {preco:of.ida.precoTotal, rateToken:of.ida.rateToken},
  {preco:of.ida.precoTotal, provider:"", rateToken:of.ida.rateToken},
]) {
  try{const r:any=await passhubRequest(`${passhubBases.nexus}/api/v1/tarifar`,{body,headers:{"X-Correlation-Id":crypto.randomUUID()}});console.log("OK",JSON.stringify(body).slice(0,60),r.provider,r.preco);}
  catch(e:any){console.log("ERR",JSON.stringify(body).slice(0,60),e.message,String(e.detalhe).slice(0,200));}
}
console.log("provedor da oferta:", JSON.stringify({p:of.ida.provedor,c:of.ida.canal}));
