import { importInfotravelQuote } from '../src/lib/quotes/infotravel-api.server';
const link = process.argv[2]!;
const { normalized } = await importInfotravelQuote(link);
for (const o of normalized.options) {
  console.log(o.optionNumber, o.label, 'total=', o.total, 'taxes=', o.taxes,
    'hoteis=', o.hotels.map(h=>h.total), 'voos=', o.flights.map(f=>[f.fare,f.taxes,f.total]),
    'outros=', [...o.services,...o.tickets,...o.transfers,...o.activities,...o.insurance].map(i=>i.total));
}
