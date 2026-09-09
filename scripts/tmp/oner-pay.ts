import { lerTelaPagamento } from "../../src/lib/integrations/oner/flow.server";
import { tokenAtual } from "../../src/lib/integrations/oner/session.server";
const t = (await tokenAtual())!;
const p = await lerTelaPagamento("898ef220-d3af-4179-9506-759b484052f5", t);
console.log("url", p.url, "total", p.total);
console.log("formas", p.formas);
console.log("parcelas", p.parcelas.slice(0,4));
for (const x of p.tentativas) console.log(x.status, x.endpoint, x.amostra.slice(0,200));
