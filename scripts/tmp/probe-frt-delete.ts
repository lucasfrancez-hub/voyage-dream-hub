import { chamarCompreFacil, COMPREFACIL_BASES } from "../../src/lib/comprefacil/auth.server";

const ORC = 5771972;
const orc = (await chamarCompreFacil(`/api/Reserva/${ORC}/false`)).dados as any;
const hotel = (orc?.Hoteis ?? [])[0];
const aereo = (orc?.Aereos ?? [])[0];
console.log("hotel id", hotel?.Id, "status", hotel?.Status, "aereo id", aereo?.Id, "status", aereo?.Status);

const tentativas: [string, string, string | undefined][] = [
  [`/api/hotel/${ORC}/${hotel?.Id}`, "DELETE", COMPREFACIL_BASES.hotel],
  [`/api/hotel/excluir/${ORC}/${hotel?.Id}`, "DELETE", COMPREFACIL_BASES.hotel],
  [`/api/hotel/remover/${ORC}/${hotel?.Id}`, "DELETE", COMPREFACIL_BASES.hotel],
  [`/api/hotel/${hotel?.Id}`, "DELETE", COMPREFACIL_BASES.hotel],
];
for (const [p, m, base] of tentativas) {
  const r = await chamarCompreFacil(p, { method: m, base });
  console.log(m, p, "->", r.status, JSON.stringify(r.dados).slice(0, 200));
}
