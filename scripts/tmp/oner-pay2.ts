import { onerFetch } from "../../src/lib/integrations/oner/client.server";
import { ONER_API } from "../../src/lib/integrations/oner/config";
import { tokenAtual } from "../../src/lib/integrations/oner/session.server";
const c = "898ef220-d3af-4179-9506-759b484052f5";
const t = (await tokenAtual())!;
const urls = [
  `/api/booking/flight/payment/${c}`,
  `/api/booking/flight/payment-methods/${c}`,
  `/api/booking/payment/${c}`,
  `/api/payment/v1/methods/${c}`,
  `/api/payment/methods/${c}`,
  `/api/checkout/payment/${c}`,
  `/api/checkout/v1/payment/${c}`,
  `/api/booking/flight/checkout/${c}`,
  `/api/booking/flight/summary/${c}`,
  `/api/payment/flight/${c}`,
  `/api/payment/v1/payment-method`,
  `/api/paymentmethod/v1/institution/23`,
];
for (const u of urls) {
  const r = await onerFetch(`${ONER_API}${u}`, { token: t });
  console.log(r.call.status, u, r.raw.slice(0, 220).replace(/\s+/g," "));
}
