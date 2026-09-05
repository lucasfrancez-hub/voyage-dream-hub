import { passhubBuscarVoos } from "../../src/lib/passhub/search.server";
import { normalizaBuscaPassHub } from "../../src/lib/passhub/normalize.server";
const d1=new Date(Date.now()+40*86400000).toISOString().slice(0,10);
const n:any=normalizaBuscaPassHub(await passhubBuscarVoos({trechos:[{origem:"GRU",destino:"REC",data:d1}],adultos:1}),0);
for (const of of n.ofertas.slice(0,3)) {
  const t=of.ida.rateToken;
  let head="";
  try{ head = Buffer.from(t,"base64").toString("utf8").slice(0,200);}catch{}
  console.log(of.ida.provedor, "|", head.replace(/[^\x20-\x7e]/g," ").slice(0,160));
}
