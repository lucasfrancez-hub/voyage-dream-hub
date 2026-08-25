import { chamarCompreFacil, COMPREFACIL_BASES } from "@/lib/comprefacil/auth.server";

const OID = 5771972;
const r = await chamarCompreFacil(`/api/Reserva/${OID}/false`);
const orc: any = r.dados ?? {};
console.log("pax:", (orc.Pessoas ?? []).map((p: any) => ({ id: p.Id, n: `${p.Nome} ${p.Sobrenome}`, cpf: p.CPF, doc: p.Documento })));
const a: any = orc?.Aereos?.[0] ?? null;
console.log("aereo:", a && { id: a.Id, loc: a.Localizador ?? a.LocalizadorAereo, status: a.Status });
const h: any = orc?.Hoteis?.[0] ?? null;
console.log("hotel:", h && { id: h.Id, loc: h.Localizador, status: h.Status });

if (a?.Id && !(a.Localizador ?? a.LocalizadorAereo)) {
  const tar = await chamarCompreFacil(`/api/Aereo/tarifar/${a.Id}`, { base: COMPREFACIL_BASES.aereo, method: "POST", body: {} });
  console.log("tarifar:", tar.ok, JSON.stringify(tar.dados)?.slice(0, 400));
  const res = await chamarCompreFacil(`/api/aereo/reservar/${a.Id}`, { base: COMPREFACIL_BASES.aereo, method: "POST", body: {} });
  console.log("reservar:", res.ok, JSON.stringify(res.dados)?.slice(0, 1200));
}
