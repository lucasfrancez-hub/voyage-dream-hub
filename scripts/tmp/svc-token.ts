import { gerarToken } from "@/lib/api/auth.server";
const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
const t = gerarToken("test");
await supabaseAdmin.from("api_clients").insert({
  name: "TEMP servicos teste", client_code: `TMP_SVC_${Date.now()}`, environment: "test",
  token_prefix: t.prefix, token_hash: t.hash, token_last4: t.last4,
  scopes: ["services:read"], active: true, rate_limit_per_min: 600,
} as never);
await Bun.write("/tmp/svc/token.txt", t.token);
console.log("token gravado");
