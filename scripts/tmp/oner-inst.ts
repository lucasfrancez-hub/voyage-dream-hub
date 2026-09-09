import { obterToken } from "@/lib/integrations/oner/session.server";
import { onerFetch } from "@/lib/integrations/oner/client.server";
import { ONER_API } from "@/lib/integrations/oner/config";
const c = "898ef220-d3af-4179-9506-759b484052f5";
const t = await obterToken({});
const tok = typeof t === "string" ? t : (t as any)?.token;
const r = await onerFetch(`${ONER_API}/api/booking/installments/${c}`, { token: tok, method: "POST", body: { totalValue: 374.05, paymentMethodId: 1, isMultiplePayment: false, vaultToken: "", vaultKey: "" } });
console.log(r.call.status, r.raw.slice(0, 400));
