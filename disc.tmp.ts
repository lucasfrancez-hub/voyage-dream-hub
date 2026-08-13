import { discoverCandidates } from "@/lib/airfare-promos.discovery.server";
const r = await discoverCandidates({ maxCandidates: 400 });
console.log("bruto", r.discoveredTotal, "dedup", r.dedupedTotal, "selec", r.candidates.length);
for (const m of r.metrics) console.log(m.origin, JSON.stringify(m));
const exc = (r.decisions ?? []).filter(d => d.status === "excluida");
console.log("excluidas:", exc.length, [...new Set(exc.map(d=>d.candidate.destination_iata))].join(","));
for (const c of r.candidates) console.log(c.scope, c.origin_iata, "->", c.destination_iata, c.departure_date, c.reference_price);
