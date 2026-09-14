import { gerarToken, hashToken } from "../../src/lib/api/auth.server";
import { API_SCOPES } from "../../src/lib/api/scopes";
import { supabaseAdmin as db } from "../../src/integrations/supabase/client.server";
const BASE = "https://pedidos.viaair.tur.br/api/public/internal/v1";
const t = gerarToken("live");
const code = "DIAG_TMP_" + Date.now();
const { data, error } = await db.from("api_clients").insert({
  name: "Diagnóstico temporário", client_code: code, environment: "live",
  token_hash: hashToken(t.token), token_prefix: t.prefixo ?? t.token.slice(0, 18),
  scopes: [...API_SCOPES], rate_limit_per_min: 120, active: true,
} as never).select("id").single();
if (error) { console.log("insert erro", error.message); process.exit(1); }
const id = (data as any).id;
const h = { authorization: `Bearer ${t.token}`, "content-type": "application/json" };
async function call(path: string, body?: any) {
  const r = await fetch(BASE + path, { method: body ? "POST" : "GET", headers: h, body: body ? JSON.stringify(body) : undefined });
  const txt = await r.text();
  console.log(path, r.status, txt.slice(0, 400));
}
await call("/oner/status");
await call("/flights/search", { origin: "GRU", destination: "GIG", departureDate: "2026-10-14", adults: 1 });
await call("/flights/search", { origin: "SAO", destination: "RIO", departureDate: "2026-10-14", returnDate: "2026-10-21", adults: 1 });
await db.from("api_clients").delete().eq("id", id);
console.log("acesso temporário removido");
