import { mensagensRecentes } from "../../src/lib/auth-code/gmail.server";
const desde = Date.now() - 30*60_000;
const m = await mensagensRecentes(desde);
console.log("mensagens:", m.length);
for (const x of m.slice(0,8)) console.log("-", new Date(x.recebidoEm).toISOString(), x.remetente, "|", x.remetenteOriginal, "|", x.assunto);
