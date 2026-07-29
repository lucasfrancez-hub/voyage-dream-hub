import { parseMultipleTourHtml } from "./src/lib/packages/tour-html";
const html = await Bun.file("/mnt/user-uploads/pasted-2026-07-29T01-14-23-134Z.txt").text();
const { parseHTML } = await import("linkedom");
(globalThis as any).DOMParser = class { parseFromString(s: string){ return parseHTML(s).document; } };
const list = parseMultipleTourHtml(html);
console.log(list.length);
for (const t of list) console.log(t.title, "| mod:", t.modalities.length, "| datas:", t.dates.length, "| precos:", t.prices.length, "| horarios:", t.times.join(","), "| taxa:", t.tax_per_person, "| min:", Math.min(...t.prices.map(p=>p.price_per_person)));
