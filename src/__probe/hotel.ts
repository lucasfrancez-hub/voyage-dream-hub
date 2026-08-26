import { chamarCompreFacil, COMPREFACIL_BASES, sessaoCompreFacil } from "../lib/comprefacil/auth.server";
const ses = await sessaoCompreFacil();
const loc = await chamarCompreFacil(`/api/Localidade/busca?texto=Lisboa`, { base: COMPREFACIL_BASES.hotel, method: "GET" }).catch((e)=>({dados:String(e)}));
console.log(JSON.stringify(loc.dados).slice(0,800));
