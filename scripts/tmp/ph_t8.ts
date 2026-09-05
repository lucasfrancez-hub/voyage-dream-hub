import { passhubBuscarVoos } from "../../src/lib/passhub/search.server";
import { normalizaBuscaPassHub } from "../../src/lib/passhub/normalize.server";
import { passhubTarifarOferta } from "../../src/lib/passhub/book.server";
const d1=new Date(Date.now()+40*86400000).toISOString().slice(0,10);
const n:any=normalizaBuscaPassHub(await passhubBuscarVoos({trechos:[{origem:"GRU",destino:"REC",data:d1}],adultos:1}),0);
const of=n.ofertas[0];
for (const prov of [of.ida.provedor, "CVC", ""]) {
  try{const r=await passhubTarifarOferta({rateTokens:[of.ida.rateToken],provedor:prov,precoEsperado:of.ida.precoTotal,ravPercentual:10});console.log(`prov="${prov}" OK`, r.preco, r.ravValor, r.pricedRateTokens.length);}
  catch(e:any){console.log(`prov="${prov}" ERR`, e.message, String(e.detalhe).slice(0,200));}
}
