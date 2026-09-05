import { passhubRequest, PassHubError } from "@/lib/passhub/client.server";
const G = "https://emissor-gerencia.passhub.com.br";
const loc = "GZWAZP"; // reserva cancelada, RAV atual = 10% / R$ 73,31
async function patch(label: string, body: unknown) {
  try {
    const r = await passhubRequest<unknown>(`${G}/api/v1/reservas/${loc}`, { method: "PATCH", body });
    console.log(`OK   ${label} ->`, JSON.stringify(r).slice(0, 500));
  } catch (e) {
    console.log(`ERR  ${label} [${(e as PassHubError).status}] ->`, String((e as PassHubError).detalhe ?? (e as Error).message).slice(0, 500));
  }
}
// mesmo valor atual: se aceitar, nada muda; se recusar, vemos o motivo
await patch("rav_percentage=10 (igual ao atual)", { rav_percentage: 10 });
await patch("rav_amount_brl=73.31 (igual)", { rav_amount_brl: 73.31 });
const det = await passhubRequest<{data:Record<string,unknown>}>(`${G}/api/v1/reservas/11995`, { method: "GET" });
console.log("após:", JSON.stringify({ rav_percentage: det.data.rav_percentage, rav_amount_brl: det.data.rav_amount_brl, valor_comissao: det.data.valor_comissao }));
