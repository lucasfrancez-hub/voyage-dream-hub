import { obterToken } from "../src/lib/integrations/oner/session.server";
import { onerFetch } from "../src/lib/integrations/oner/client.server";
import { ONER_API } from "../src/lib/integrations/oner/config";
const cartId = process.argv[2]!;
const token = (await obterToken({} as any))!;
const base = {
  paymentMethod: 4, sourceIp: "", creditCardPayments: [], cartId,
  paymentHubId: "null", fingerprint: "",
  pixPayment: { documentNumber: "39053344705", documentType: 1 },
  coupon: "", submitPaymentStr: new Date().toISOString().replace(/\.\d+Z$/, " GMT+00:00"),
  purchaseForCustomer: false, acceptedTerms: { insuranceCloseCheckIn: false },
};
const variantes: Record<string, any> = {
  A_purchaseTrue: { ...base, purchaseForCustomer: true },
  B_hubNull: { ...base, paymentHubId: null },
  C_ip: { ...base, sourceIp: "177.0.0.1", fingerprint: "viaair" },
  D_semAcceptedTerms: (()=>{ const b={...base}; delete (b as any).acceptedTerms; return b; })(),
  E_docTipoString: { ...base, pixPayment: { documentNumber: "39053344705", documentType: "1" } },
};
for (const [nome, body] of Object.entries(variantes)) {
  const r = await onerFetch(`${ONER_API}/api/booking/payNotification`, { token, method: "POST", timeoutMs: 120000, body });
  console.log(nome, r.call.status, (r.call.message||"").slice(0,200));
  if (r.call.ok) { console.log("RAW", (r.raw||"").slice(0,600)); break; }
}
