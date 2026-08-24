import { chamarCompreFacil } from "../../src/lib/comprefacil/auth.server";
const paths = [
 "/api/cidade","/api/cidade?Termo=Maring","/api/cidade?Descricao=Maring","/api/cidade?Busca=Maring",
 "/api/cidade?Pagina=1&ItensPorPagina=10","/api/cidade/pesquisar?Filtro=Maring",
 "/api/pacote/filtro","/api/pacote/destinos","/api/pacote/cidadesaida","/api/cidadesaida",
];
for (const p of paths) {
  try { const r = await chamarCompreFacil(p); console.log("==",p, r.ok, JSON.stringify(r.dados).slice(0,300)); }
  catch(e){ console.log("==",p,"ERR",(e as Error).message.slice(0,100)); }
}
