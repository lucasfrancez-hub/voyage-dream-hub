import { getPublicQuoteByPublicId } from "@/lib/public-quote/store.server";
import { materializeOrderFromPublicQuote } from "@/lib/orders/materialize-from-quote.server";
const q: any = await getPublicQuoteByPublicId("6xtnh5n89d");
console.log("quote?", !!q, q && Object.keys(q.products ?? {}), q?.options?.length);
if (q) console.log("created", await materializeOrderFromPublicQuote("89eaac97-311a-4f61-a0a8-920cac891d7b", q, 40606.73));
