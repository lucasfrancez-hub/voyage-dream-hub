import { chamarCompreFacil, COMPREFACIL_BASES } from "@/lib/comprefacil/auth.server";
const H = COMPREFACIL_BASES.hotel, oid = 5771972, hid = 17193686;
const pol = await chamarCompreFacil(`/api/hotel/politica/${oid}/${hid}`, { base: H, method: "PATCH", body: {} });
const dp: any = pol.dados ?? {};
const politica = dp?.Politica ?? dp?.politica ?? null;
console.log("POLITICA", pol.status, politica ? Object.keys(politica).slice(0,40) : JSON.stringify(dp).slice(0,500));
if (politica) {
  const res = await chamarCompreFacil("/api/Hotel/reservar", { base: H, method: "POST", body: politica });
  const d: any = res.dados ?? {};
  console.log("RESERVAR HOTEL", res.status, JSON.stringify({ msg: d.mensagens, status: d?.Status ?? d?.Hotel?.Status, loc: d?.Localizador ?? d?.Hotel?.Localizador }).slice(0,600));
}
