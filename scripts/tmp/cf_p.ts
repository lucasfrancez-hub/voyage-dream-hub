import { chamarCompreFacil } from "../../src/lib/comprefacil/auth.server";
for (const p of ["/api/pacote?Pagina=1&ItensPorPagina=5","/api/pacote?Pagina=1&ItensPorPagina=5&Filtro=Maring","/api/pacote?Pagina=1&ItensPorPagina=5&CidadeSaida=Maring"]) {
 const r = await chamarCompreFacil(p);
 const d:any=r.dados;
 console.log("==",p,r.ok,"keys",Object.keys(d??{}).slice(0,10), "total", d?.Total??d?.TotalItens??d?.TotalRegistros, "n", d?.Items?.length);
 if(d?.Items?.[0]) console.log("sample keys", Object.keys(d.Items[0]).slice(0,40));
}
