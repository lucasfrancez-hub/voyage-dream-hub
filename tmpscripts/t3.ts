import { importInfotravelQuoteResilient } from "../src/lib/quotes/infotravel-api.server";
import { completarCampos } from "../src/lib/cativa/voos.server";
const r: any = await importInfotravelQuoteResilient(process.argv[2]!, 2);
const n = r.normalized;
console.log("values", n.values, "pax", n.passengers);
for (const o of n.options ?? []) console.log(o.optionNumber, JSON.stringify(o.label), "total", o.total, "taxas", o.taxes, "hoteis", o.hotels?.length, "voos", o.flights?.length);
console.log("patch", completarCampos({ hoteis: [] }, n.options ?? []));
