import { searchReadyPackages } from "@/lib/packages/ready-packages.server";
const r = await searchReadyPackages({ destination: "Aracaju", children: [], onlyAvailable: true, limit: 3 } as any);
console.log(r.status, r.total_count);
for (const p of r.packages) console.log(JSON.stringify({t:p.title,slug:p.slug,basis:p.pricing_basis,occ:p.base_occupancy,label:p.occupancy_label,total:p.package_total,taxes:p.taxes,inc:p.taxes_included,going:p.going_date,av:p.availability,card:p.installment_plan.card},null,0));
