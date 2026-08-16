import { radarOrigins, radarCategories, radarLeadsForOrigin, radarOpportunitiesForLead, radarSourceMetrics } from "../src/lib/melhores-destinos.radar-api.server";
const o = await radarOrigins();
console.log("origins", o.length, o.find((x) => x.iata === "MGF"));
const cats = await radarCategories();
console.log("cats", cats.slice(0, 3));
const leads = await radarLeadsForOrigin("MGF", { deadline: Date.now() + 90_000 });
console.log("leads", leads.length, leads[0]);
if (leads[0]) {
  const ops = await radarOpportunitiesForLead(leads[0], 3);
  console.log("ops", JSON.stringify(ops, null, 1).slice(0, 1600));
}
console.log("metrics", radarSourceMetrics());
