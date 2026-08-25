import { chamarCompreFacil, COMPREFACIL_BASES } from "../../src/lib/comprefacil/auth.server";
const ORC = 5771972;
const orc = (await chamarCompreFacil(`/api/Reserva/${ORC}/false`)).dados as any;
const aereo = (orc?.Aereos ?? [])[0];
console.log("aereo", aereo?.Id, aereo?.Status);
for (const [p, base] of [
  [`/api/aereo/${aereo?.Id}`, COMPREFACIL_BASES.aereo],
  [`/api/aereo/${ORC}/${aereo?.Id}`, COMPREFACIL_BASES.aereo],
] as [string, string][]) {
  const r = await chamarCompreFacil(p, { method: "DELETE", base });
  console.log("DELETE", p, r.status, JSON.stringify(r.dados).slice(0, 200));
}
const depois = (await chamarCompreFacil(`/api/Reserva/${ORC}/false`)).dados as any;
console.log("aereos restantes", (depois?.Aereos ?? []).map((a: any) => a?.Id), "hoteis", (depois?.Hoteis ?? []).map((h: any) => h?.Id));
