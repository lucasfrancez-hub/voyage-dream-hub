import { chamarCompreFacil, COMPREFACIL_BASES } from "../../src/lib/comprefacil/auth.server";
const H=COMPREFACIL_BASES.hotel;
for(const p of ["/api/cidade/377","/api/cidade/obter/377","/api/cidade/buscarporid/377"]){
  try{const r=await chamarCompreFacil(p,{base:H} as any); console.log("==",p,r.ok,JSON.stringify(r.dados).slice(0,400));}catch(e){}
}
