import { chamarCompreFacil, COMPREFACIL_BASES } from "../../src/lib/comprefacil/auth.server";
const cands = ["/api/transfer/buscaasync","/api/Transfer/buscaasync","/api/servico/buscaasync","/api/Servico/buscaasync","/api/offlineservico/busca","/api/offlineservico?CidadeId=349"];
for (const c of cands) {
  for (const [k, base] of Object.entries(COMPREFACIL_BASES)) {
    try {
      const r = await chamarCompreFacil(c, { base: base as any, method: c.includes("busca") ? "POST" : "GET", body: c.includes("busca") ? { Cidade: { Id: 349 }, DataIda: "2026-10-10" } as any : undefined } as any);
      console.log(k, c, r.status, JSON.stringify(r.dados).slice(0,200));
    } catch (e) { console.log(k, c, "ERR", (e as Error).message.slice(0,80)); }
  }
}
