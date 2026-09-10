import { obterToken } from "../src/lib/integrations/oner/session.server";
import { onerFetch } from "../src/lib/integrations/oner/client.server";
import { ONER_API } from "../src/lib/integrations/oner/config";
const cartId = process.argv[2]!;
const token = (await obterToken({} as any))!;
const r = await onerFetch(`${ONER_API}/api/checkout/v1/booking/${cartId}`, { token });
console.log(r.call.status, (r.raw||"").slice(0,2500));
