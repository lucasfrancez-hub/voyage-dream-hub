import { importInfotravelQuoteResilient } from "../src/lib/quotes/infotravel-api.server";
const r: any = await importInfotravelQuoteResilient(process.argv[2]!, 2);
const raw = r.raw;
const s = JSON.stringify(raw);
// find fares entries
const seen = new Map<string, number>();
const walk = (n: any) => {
  if (!n || typeof n !== "object") return;
  if (Array.isArray(n)) return n.forEach(walk);
  if (Array.isArray(n.fares)) for (const f of n.fares) {
    const k = `${f?.type} isFareRate=${f?.isFareRate} discount=${f?.discount}`;
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  Object.values(n).forEach(walk);
};
walk(raw);
console.log([...seen.entries()]);
console.log("len", s.length);
