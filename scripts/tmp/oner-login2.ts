import { solicitarCodigo, validarCodigo, tokenAtual } from "../../src/lib/integrations/oner/session.server";
import { registrarCodigoRecebido, aguardarCodigo } from "../../src/lib/integrations/oner/otp.server";
import { mensagensRecentes } from "../../src/lib/auth-code/gmail.server";
import { escolherMensagem } from "../../src/lib/auth-code/service.server";
import { acharProvedor } from "../../src/lib/auth-code/providers";

const p = await solicitarCodigo(null);
console.log("send-code", p.ok, p.pedidoId);
const desde = Date.now() - 60_000;
let ok = false;
for (let i = 0; i < 40 && !ok; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  try {
    const m = await mensagensRecentes(desde);
    const a = escolherMensagem(m, acharProvedor("oner"), desde, new Set());
    if (a) {
      const r = await registrarCodigoRecebido({
        remetente: a.mensagem.remetenteOriginal || a.mensagem.remetente,
        assunto: a.mensagem.assunto,
        corpo: a.mensagem.corpo,
        recebidoEm: new Date(a.mensagem.recebidoEm).toISOString(),
        messageId: `gmail:${a.mensagem.id}`,
        origem: "gmail",
      });
      console.log("registro", r);
      ok = r.ok;
    }
  } catch (e) { console.log("erro gmail", String(e).slice(0,200)); }
}
if (!ok) { console.log("sem codigo"); process.exit(0); }
const codigo = await aguardarCodigo(p.pedidoId, 20000);
console.log("codigo obtido?", Boolean(codigo));
if (codigo) console.log("validar", await validarCodigo(codigo));
console.log("token?", Boolean(await tokenAtual()));
