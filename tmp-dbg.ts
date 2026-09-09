const { mensagensRecentes } = await import("@/lib/auth-code/gmail.server");
const { escolherMensagem } = await import("@/lib/auth-code/service.server");
const { acharProvedor } = await import("@/lib/auth-code/providers");
const { pareceAutenticacao, combinaComProvedor, extrairCodigo } = await import("@/lib/auth-code/extract");
const p = acharProvedor("oner");
const desde = Date.now() - 30*60*1000;
const ms = await mensagensRecentes(desde);
for (const m of ms) {
  const texto = `${m.assunto}\n${m.corpo}`;
  console.log({id:m.id, auth: pareceAutenticacao(texto), combina: combinaComProvedor(p, m), codigo: extrairCodigo(texto,p)?"achou":"nao", recebido:new Date(m.recebidoEm).toISOString(), corpoLen:m.corpo.length});
}
console.log("escolha:", escolherMensagem(ms, p, desde, new Set())? "ok":"null");
