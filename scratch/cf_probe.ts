import { chamarCompreFacil } from "../src/lib/comprefacil/auth.server";
const paths = [
  "/api/pacote?Pagina=1&ItensPorPagina=2&Filtro=cancun",
  "/api/pacote?Pagina=1&ItensPorPagina=2&Nome=cancun",
  "/api/pacote/busca?Pagina=1&ItensPorPagina=2",
  "/api/pacotedestino",
  "/api/cidade?Pagina=1&ItensPorPagina=2&Filtro=cancun",
];
for (const p of paths) {
  try {
    const r = await chamarCompreFacil(p);
    const d: any = r.dados;
    console.log(p, r.status, Array.isArray(d?.Items) ? `items=${d.Items.length} total=${d?.MetaData?.TotalItens}` : JSON.stringify(d).slice(0,200));
    if (Array.isArray(d?.Items) && d.Items[0] && p.includes("Filtro=cancun") && p.includes("pacote")) {
      console.log("  primeiro:", d.Items[0].Nome, d.Items[0].Cidade?.Nome);
    }
  } catch (e) { console.log(p, "ERRO", (e as Error).message); }
}
