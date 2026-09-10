import { obterToken } from "../src/lib/integrations/oner/session.server";
import { solicitarPixOner, cancelarPagamento } from "../src/lib/integrations/oner/payment.server";
const cartId = process.argv[2]!;
const token = await obterToken({} as any);
const c = await cancelarPagamento(token!, cartId);
console.log("CANCEL", JSON.stringify(c));
const r = await solicitarPixOner(token!, { cartId, documentNumber:"39053344705", documentType:1, valor:574.79, purchaseForCustomer:false });
console.log("HTTP", JSON.stringify(r.call), (r.raw||"").slice(0,600));
