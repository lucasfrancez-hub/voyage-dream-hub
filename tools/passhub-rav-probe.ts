/**
 * Sonda SEGURA da API PassHub: procura rotas escondidas para alterar a RAV
 * depois da reserva. Só usa GET/OPTIONS e PATCH numa reserva já CANCELADA
 * (teste com percentual idêntico não altera nada). NUNCA roda em reserva ativa.
 */
import { passhubRequest } from "@/lib/passhub/client.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const G = "https://emissor-gerencia.passhub.com.br";

async function tenta(label: string, url: string, init?: { method?: string; body?: unknown }) {
  try {
    const r = await passhubRequest<unknown>(url, init ?? { method: "GET" });
    console.log(`OK   ${label} ->`, JSON.stringify(r).slice(0, 300));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = (e as { status?: number }).status;
    console.log(`ERR  ${label} [${status}] -> ${msg.slice(0, 200)}`);
  }
}

const { data: canceladas } = await supabaseAdmin
  .from("passhub_reserva_cancelada")
  .select("localizador, id_passagem")
  .limit(3);
const { data: ativas } = await supabaseAdmin
  .from("passhub_reserva_bilhete")
  .select("localizador")
  .limit(1);

const locCancelada = canceladas?.[0]?.localizador ?? "";
console.log("canceladas p/ teste:", canceladas?.map((c) => c.localizador));

// 1) Campos da reserva (leitura) — ver se RAV aparece e com que nome
if (locCancelada) {
  const det = await passhubRequest<Record<string, unknown>>(`${G}/api/v1/reservas/${locCancelada}`, { method: "GET" });
  const alvo = Array.isArray(det) ? det[0] : ((det["data"] as Record<string, unknown>) ?? det);
  console.log("\n=== chaves da reserva ===");
  console.log(Object.keys(alvo ?? {}).join(", "));
  const ravil = Object.entries(alvo ?? {}).filter(([k]) => /rav|comiss|fee|taxa_ag|remuner/i.test(k));
  console.log("campos de RAV/comissão:", JSON.stringify(ravil));
}

// 2) Rotas candidatas escondidas (GET → 404 = não existe; 405/422 = existe)
for (const p of [
  `/api/v1/reservas/${locCancelada}/rav`,
  `/api/v1/reservas/${locCancelada}/comissao`,
  `/api/v1/reservas/${locCancelada}/comissao-extra`,
  `/api/v1/reservas/${locCancelada}/alterar-rav`,
  `/api/v1/reservas/rav`,
  `/api/v1/comissoes`,
  `/api/v1/agencia/rav`,
  `/api/v1/agencia/comissao`,
]) {
  await tenta(`GET ${p}`, `${G}${p}`);
}

// 3) PATCH de RAV na reserva CANCELADA com o MESMO valor atual (zero risco)
if (locCancelada) {
  await tenta(
    `PATCH rav_percentage (reserva cancelada ${locCancelada})`,
    `${G}/api/v1/reservas/${locCancelada}`,
    { method: "PATCH", body: { rav_percentage: 0 } },
  );
  // confere se algo mudou
  await tenta(`GET confere`, `${G}/api/v1/reservas/${locCancelada}`);
}

console.log("\nativa só p/ referência:", ativas?.[0]?.localizador ?? "nenhuma");
