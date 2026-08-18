import { importInfotravelQuoteResilient } from "../src/lib/quotes/infotravel-api.server";
const q: any = await importInfotravelQuoteResilient(process.argv[2]!, 2);
console.log(Object.keys(q));
const quote = q.quote ?? q;
console.log(Object.keys(quote), quote.values);
for (const o of quote.options ?? []) console.log(o.optionNumber, o.label, "total", o.total, "taxas", o.taxes, "hoteis", o.hotels?.length, "voos", o.flights?.length);
