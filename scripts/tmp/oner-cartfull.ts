import { onerFetch } from "../../src/lib/integrations/oner/client.server";
import { ONER_API } from "../../src/lib/integrations/oner/config";
import { tokenAtual } from "../../src/lib/integrations/oner/session.server";
const token = (await tokenAtual())!;
const r = await onerFetch(`${ONER_API}/api/checkout/v1/booking/898ef220-d3af-4179-9506-759b484052f5`, { token });
const s = r.raw;
const i = s.toLowerCase().indexOf("passenger");
console.log("len", s.length, "idx", i);
console.log(s.slice(Math.max(0,i-300), i+2500));
