import { abrirPedidoCodigo, aguardarCodigo } from "../../src/lib/integrations/oner/otp.server";
const p = await abrirPedidoCodigo();
const c = await aguardarCodigo(p.id, 200_000);
console.log(c ?? "");
