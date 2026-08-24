import { chamarCompreFacil } from "../../src/lib/comprefacil/auth.server";
const r = await chamarCompreFacil("/api/pacote?Pagina=1&ItensPorPagina=5");
const d:any=r.dados; console.log("MetaData", JSON.stringify(d.MetaData));
console.log(d.Items.map((i:any)=>[i.Nome,i.Cidade?.Nome??i.Cidade,i.CidadeId]));
