import { onerFetch } from "../../src/lib/integrations/oner/client.server";
import { ONER_API } from "../../src/lib/integrations/oner/config";
import { tokenAtual } from "../../src/lib/integrations/oner/session.server";
const cartId = "898ef220-d3af-4179-9506-759b484052f5";
const token = (await tokenAtual())!;
for (const url of [
  `${ONER_API}/api/booking/flight/passenger/${cartId}`,
  `${ONER_API}/api/booking/flight/${cartId}`,
  `${ONER_API}/api/checkout/v1/booking/${cartId}/passengers`,
]) {
  const r = await onerFetch(url, { token });
  console.log("GET", url, r.call.status, r.raw.slice(0, 800));
  console.log("---");
}
