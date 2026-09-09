const { obterToken } = await import("@/lib/integrations/oner/session.server");
const t = await obterToken({ esperarCodigoMs: 150000, forcarNovo: true });
console.log("token:", t ? "obtido (" + t.length + " chars)" : "NAO obtido");
if (t) {
  const { executarFluxoOner } = await import("@/lib/integrations/oner/flow.server");
  const r = await executarFluxoOner({
    cartRef: "https://www.comprarviagem.com.br/viaair/flight-cart/898ef220-d3af-4179-9506-759b484052f5?source=f&isRoundTrip=false",
    semNovoLogin: true,
  });
  console.log(JSON.stringify({ ok: r.ok, cartId: r.cartId, parouEm: r.parouEm, etapas: r.etapas.map(e=>({e:e.chave,ok:e.ok,d:e.detalhe})) }, null, 2));
}
