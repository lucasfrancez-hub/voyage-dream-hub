import { passhubRequest, PassHubError } from "@/lib/passhub/client.server";
const G = "https://emissor-gerencia.passhub.com.br";
const loc = "GZWAZP"; // cancelada, limite de emissão vencido em 23/08 — nunca será emitida
async function patch(label: string, body: unknown) {
  try {
    const r = await passhubRequest<unknown>(`${G}/api/v1/reservas/${loc}`, { method: "PATCH", body });
    console.log(`OK   ${label} ->`, JSON.stringify(r).slice(0, 300));
  } catch (e) {
    console.log(`ERR  ${label} [${(e as PassHubError).status}] ->`, String((e as PassHubError).detalhe ?? (e as Error).message).slice(0, 400));
  }
}
await patch("rav_percentage=9 (teste)", { rav_percentage: 9 });
let det = await passhubRequest<{data:Record<string,unknown>}>(`${G}/api/v1/reservas/11995`, { method: "GET" });
console.log("após mudar p/ 9:", JSON.stringify({ rav_percentage: det.data.rav_percentage, rav_amount_brl: det.data.rav_amount_brl, valor_comissao: det.data.valor_comissao }));
// restaura o valor original
await patch("rav_percentage=10 (restaura)", { rav_percentage: 10 });
det = await passhubRequest<{data:Record<string,unknown>}>(`${G}/api/v1/reservas/11995`, { method: "GET" });
console.log("após restaurar:", JSON.stringify({ rav_percentage: det.data.rav_percentage, rav_amount_brl: det.data.rav_amount_brl, valor_comissao: det.data.valor_comissao }));
