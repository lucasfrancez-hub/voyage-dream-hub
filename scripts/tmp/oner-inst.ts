import { obterToken } from "@/lib/integrations/oner/session.server";
import { onerFetch } from "@/lib/integrations/oner/client.server";
import { ONER_API } from "@/lib/integrations/oner/config";
const c = "898ef220-d3af-4179-9506-759b484052f5";
const t = await obterToken({});
const tok = typeof t === "string" ? t : (t as any)?.token;
const paths = [
 `/api/booking/installments/${c}?total=374.05&paymentMethodId=1`,
 `/api/booking/v1/installments/${c}?total=374.05&paymentMethodId=1`,
 `/api/checkout/v1/booking/installments/${c}?total=374.05&paymentMethodId=1`,
 `/api/booking/${c}`,
];
for (const p of paths) {
  const r = await onerFetch(ONER_API + p, { token: tok });
  console.log(r.call.status, p, r.raw.slice(0,120));
}
