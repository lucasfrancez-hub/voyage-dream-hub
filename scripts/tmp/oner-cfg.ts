import { obterToken } from "@/lib/integrations/oner/session.server";
import { onerFetch } from "@/lib/integrations/oner/client.server";
import { ONER_API, ONER_INSTITUTION_ID } from "@/lib/integrations/oner/config";
const c = "898ef220-d3af-4179-9506-759b484052f5";
const t = await obterToken({});
const tok = typeof t === "string" ? t : (t as any)?.token;
for (const p of [`/api/checkout/v1/configuration/${ONER_INSTITUTION_ID}`, `/api/checkout/v1/configuration/${c}`]) {
  const r = await onerFetch<any>(ONER_API + p, { token: tok });
  const d = (r.body as any)?.data ?? r.body;
  console.log(r.call.status, p, JSON.stringify(d?.allowedPaymentMethods ?? d)?.slice(0, 500));
}
