import { onerFetch } from "../../src/lib/integrations/oner/client.server";
import { ONER_API } from "../../src/lib/integrations/oner/config";
import { tokenAtual } from "../../src/lib/integrations/oner/session.server";

const token = (await tokenAtual())!;
for (const u of ["/api/client", "/api/institution/countries"]) {
  const r = await onerFetch(`${ONER_API}${u}`, { token });
  console.log("GET", u, r.call.status, r.raw.slice(0, 1200));
  console.log("---");
}
