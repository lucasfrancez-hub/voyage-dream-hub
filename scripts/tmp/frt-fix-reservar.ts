import { chamarCompreFacil, COMPREFACIL_BASES } from "@/lib/comprefacil/auth.server";
const oid = 5771972, aereoId = 5326086;
const lido = await chamarCompreFacil(`/api/Reserva/${oid}/false`);
const orc: any = lido.dados ?? {};
const vistos = new Set<string>();
const paxes = (orc.Pessoas ?? []).map((p: any) => {
  const cpf = String(p.CPF ?? "").replace(/\D/g, "");
  const manter = cpf && !vistos.has(cpf);
  if (manter) vistos.add(cpf);
  return { ...p, CPF: manter ? p.CPF : null };
});
const up = await chamarCompreFacil(`/api/reservas/paxes/${oid}`, { method: "POST", body: paxes });
console.log("PAXES", up.status, JSON.stringify(up.dados).slice(0, 300));
const res = await chamarCompreFacil(`/api/aereo/reservar/${aereoId}`, { base: COMPREFACIL_BASES.aereo, method: "POST", body: {} });
const d: any = res.dados ?? {};
console.log("AEREO", res.status, JSON.stringify({ msg: d.mensagens, loc: d?.Localizador ?? d?.LocalizadorAereo ?? d?.dados?.Localizador, status: d?.Status ?? d?.dados?.Status }).slice(0,600));
