import { chamarCompreFacil, COMPREFACIL_BASES } from "@/lib/comprefacil/auth.server";
const H = COMPREFACIL_BASES.hotel, oid = 5771972, hid = 17193686;
const pol = await chamarCompreFacil(`/api/hotel/politica/${oid}/${hid}`, { base: H, method: "PATCH", body: {} });
const p: any = (pol.dados as any)?.Politica;
console.log("POLITICA", JSON.stringify({ ...p, Token: p?.Token ? "***" : null }, null, 1));
const corpo = { ...p, CienteEmGastos: true, CientePolitica: true, CienteAlterouValor: true };
const res = await chamarCompreFacil("/api/Hotel/reservar", { base: H, method: "POST", body: corpo });
console.log("RESERVAR", res.status, JSON.stringify(res.dados).slice(0,800));
