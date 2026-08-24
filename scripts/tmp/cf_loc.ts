import { chamarCompreFacil } from "../../src/lib/comprefacil/auth.server";
const paths = [
 "/api/cidade?Filtro=Maring",
 "/api/cidade/autocomplete?Filtro=Maring",
 "/api/localidade?Filtro=Maring",
 "/api/cidade?Nome=Maring",
 "/api/pacote/cidades?Filtro=Maring",
 "/api/cidade?Pagina=1&ItensPorPagina=10&Filtro=Maring",
];
for (const p of paths) {
  try { const r = await chamarCompreFacil(p); console.log(p, r.ok, JSON.stringify(r.dados).slice(0,300)); }
  catch(e){ console.log(p,"ERR",(e as Error).message.slice(0,120)); }
}
