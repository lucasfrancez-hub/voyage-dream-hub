import { chamarCompreFacil, COMPREFACIL_BASES as B } from "../../src/lib/comprefacil/auth.server";
const tries: Array<[string,string]> = [];
for (const base of [B.aereo,B.hotel,B.servico,B.principal]) {
  for (const p of ["/api/cidade/autocomplete?termo=maring","/api/localidade/autocomplete?termo=maring","/api/localidade?termo=maring","/api/autocomplete?termo=maring","/api/cidade/buscar?termo=maring","/api/aeroporto?termo=maring","/api/destino?termo=maring"]) tries.push([base,p]);
}
for (const [base,p] of tries) {
  try { const r = await chamarCompreFacil(p,{base} as any); const s=JSON.stringify(r.dados).slice(0,200); if(r.ok||!/404|inválida|internal_error/.test(s)) console.log("OK",base,p,r.ok,s); }
  catch(e){}
}
console.log("done");
