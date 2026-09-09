import { obterToken, tokenAtual } from "../../src/lib/integrations/oner/session.server";
import { onerFetch } from "../../src/lib/integrations/oner/client.server";
import { ONER_API } from "../../src/lib/integrations/oner/config";
const cart = "898ef220-d3af-4179-9506-759b484052f5";
const token = (await tokenAtual()) ?? (await obterToken({ esperarCodigoMs: 180000, forcarNovo: true }));
const b = await onerFetch<any>(`${ONER_API}/api/checkout/v1/booking/${cart}`, { token });
console.log("booking", b.call.status, Object.keys(b.body?.data ?? {}).join(","));
const d = b.body?.data ?? {};
console.log("orderSummary", JSON.stringify(d.orderSummary));
for (const k of Object.keys(d)) if (/pay|method|card|split|install/i.test(k)) console.log("FIELD", k, JSON.stringify(d[k]).slice(0,600));
for (const pm of [1,2,3,4,5,6]) {
  const r = await onerFetch<any>(`${ONER_API}/api/checkout/v1/${cart}/discount`, { method:"PUT", token, body:{ paymentMethod: pm, coupon: "" } });
  console.log("PM", pm, r.call.status, JSON.stringify(r.body?.data?.orderSummary?.installments ?? r.body?.message ?? r.raw.slice(0,200)).slice(0,600));
}
