import { passhubRequest, PassHubError } from "@/lib/passhub/client.server";
const G = "https://emissor-gerencia.passhub.com.br";
const id = 11995; // reserva cancelada
async function patch(label: string, body: unknown) {
  try {
    const r = await passhubRequest<unknown>(`${G}/api/v1/reservas/${id}`, { method: "PATCH", body });
    console.log(`OK   ${label} ->`, JSON.stringify(r).slice(0, 400));
  } catch (e) {
    const st = (e as PassHubError).status;
    const det = (e as PassHubError).detalhe;
    console.log(`ERR  ${label} [${st}] ->`, String(det ?? (e as Error).message).slice(0, 500));
  }
}
await patch("rav_percentage=10 (mesmo valor atual)", { rav_percentage: 10 });
await patch("rav_amount_brl", { rav_amount_brl: 73.31 });
await patch("valor_comissao", { valor_comissao: 76.54 });
// confere se mudou algo
const det = await passhubRequest<{data:Record<string,unknown>}>(`${G}/api/v1/reservas/${id}`, { method: "GET" });
console.log("após:", JSON.stringify({ rav_percentage: det.data.rav_percentage, rav_amount_brl: det.data.rav_amount_brl, valor_comissao: det.data.valor_comissao }));
