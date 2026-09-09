import { obterToken } from "@/lib/integrations/oner/session.server";
import { consultarParcelas } from "@/lib/integrations/oner/payment.server";
const cartId = "898ef220-d3af-4179-9506-759b484052f5";
const t = await obterToken({});
const tok = typeof t === "string" ? t : (t as any)?.token;
const r = await consultarParcelas(tok, cartId, 374.05, 1);
console.log(r.call.status, r.opcoes.length, JSON.stringify(r.opcoes.slice(0, 3)));
