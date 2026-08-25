import { chamarCompreFacil, COMPREFACIL_BASES } from "@/lib/comprefacil/auth.server";
const A = COMPREFACIL_BASES.aereo, aereoId = 5326086;
const dup = await chamarCompreFacil(`/api/aereo/${aereoId}/TemDuplicidade`, { base: A });
console.log("DUP", dup.status, JSON.stringify(dup.dados).slice(0,300));
const tar = await chamarCompreFacil(`/api/Aereo/tarifar/${aereoId}`, { base: A, method: "POST", body: {} });
console.log("TARIFAR", tar.status, JSON.stringify(tar.dados).slice(0,800));
const res = await chamarCompreFacil(`/api/aereo/reservar/${aereoId}`, { base: A, method: "POST", body: {} });
console.log("RESERVAR", res.status, JSON.stringify(res.dados).slice(0,2000));
