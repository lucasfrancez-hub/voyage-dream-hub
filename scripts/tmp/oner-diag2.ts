import { mensagensRecentes } from "../../src/lib/auth-code/gmail.server";
import { escolherMensagem } from "../../src/lib/auth-code/service.server";
import { acharProvedor } from "../../src/lib/auth-code/providers";
const desde = Date.now() - 40*60_000;
const m = await mensagensRecentes(desde);
const p = acharProvedor("oner");
console.log("provedor", p?.id, JSON.stringify(p));
const a = escolherMensagem(m, p, desde, new Set());
console.log("achado?", a ? a.mensagem.assunto + " => " + a.codigo : null);
