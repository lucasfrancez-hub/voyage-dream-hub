import { chamarCompreFacil, COMPREFACIL_BASES } from "@/lib/comprefacil/auth.server";
const OID = 5771972, HID = 17193686;
const pol = await chamarCompreFacil(`/api/hotel/politica/${OID}/${HID}`, { base: COMPREFACIL_BASES.hotel, method: "PATCH", body: {} });
const dp: any = pol.dados ?? {};
const politica = dp?.Politica ?? dp?.politica ?? null;
console.log("politica ok:", pol.ok, "valida:", politica?.PoliticaValida, "alterou:", politica?.AlterouValor, politica?.DiferencaValor, "bloqueio:", politica?.BloqueioAumentoTarifa, "msg:", String(politica?.Mensagem ?? "").slice(0,200));
if (politica) {
  const res = await chamarCompreFacil(`/api/Hotel/reservar`, { base: COMPREFACIL_BASES.hotel, method: "POST", body: { ...politica, CientePolitica: true, CienteEmGastos: true, CienteAlterouValor: true } });
  console.log("reservar hotel:", res.ok, JSON.stringify(res.dados)?.slice(0, 800));
}
