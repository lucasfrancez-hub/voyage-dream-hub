import { importInfotravelQuote } from "./src/lib/quotes/infotravel-api.server";
const url = process.argv[2]!;
const { normalized } = await importInfotravelQuote(url);
console.log("opcoes", normalized.options.length);
for (const o of normalized.options) console.log(o.optionNumber, "total", o.total, "taxas", o.taxes);
console.log("values", normalized.values);
