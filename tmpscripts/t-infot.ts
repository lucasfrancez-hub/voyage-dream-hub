import { importInfotravelQuoteResilient } from "../src/lib/quotes/infotravel-api.server";
import { completarCampos } from "../src/lib/cativa/voos.server";
const link = process.argv[2]!;
const q: any = await importInfotravelQuoteResilient(link, 2);
const ops = q?.options ?? q?.quote?.options ?? [];
console.log("opcoes:", ops.length);
for (const o of ops) console.log(o.optionNumber, o.label, "total", o.total, "taxas", o.taxes);
console.log("patch", completarCampos({ hoteis: [] }, ops));
