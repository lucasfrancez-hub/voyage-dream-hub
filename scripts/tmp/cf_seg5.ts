import { chamarCompreFacil, COMPREFACIL_BASES } from "../../src/lib/comprefacil/auth.server";
const tent: [string,string][] = [
 [COMPREFACIL_BASES.servico,"/api/Seguro/Coberturas?Codigo=B51"],
 [COMPREFACIL_BASES.servico,"/api/SeguroCobertura?Codigo=B51"],
 [COMPREFACIL_BASES.servico,"/api/Seguro/plano/B51"],
 [COMPREFACIL_BASES.principal,"/api/Seguro/coberturas?Codigo=B51"],
 [COMPREFACIL_BASES.principal,"/api/Seguro/B51"],
 [COMPREFACIL_BASES.servico,"/api/Seguro/tabela?TarifaCodigo=43780"],
 [COMPREFACIL_BASES.servico,"/api/TarifaSeguro/43780"],
 [COMPREFACIL_BASES.servico,"/api/Tarifa/43780"],
];
for(const [base,r] of tent){
  const res=await chamarCompreFacil(r,{base});
  console.log(base.slice(8,20),r,res.status,JSON.stringify(res.dados??"").slice(0,250).replace(/\n/g," "));
}
