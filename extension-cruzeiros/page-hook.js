/* VIA AIR — Exportar Cruzeiro: observador MAIN world.
 * Prioridade do briefing: preferir os JSON que o próprio portal já busca,
 * em vez de raspar HTML. Guarda as últimas respostas JSON em memória e
 * entrega ao content script quando ele pede uma captura. */
(function () {
  const MAX = 60;
  const store = [];

  const INTERESTING =
    /(cruise|cruzeiro|ship|navio|itiner|cabin|cabine|fare|tarif|amenit|attraction|atrac|deck|media|gallery|galeria|additional|adicional|insurance|seguro|checkout|booking|price|preco|preço)/i;

  function push(url, status, body) {
    if (!body || typeof body !== "object") return;
    if (!INTERESTING.test(String(url))) return;
    store.push({ url: String(url), status, body, at: Date.now() });
    while (store.length > MAX) store.shift();
  }

  function tryParse(text) {
    if (!text || typeof text !== "string") return null;
    const t = text.trim();
    if (!t.startsWith("{") && !t.startsWith("[")) return null;
    if (t.length > 4_000_000) return null;
    try {
      return JSON.parse(t);
    } catch (_) {
      return null;
    }
  }

  const originalFetch = window.fetch;
  window.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : input && input.url ? input.url : String(input || "");
    const response = await originalFetch.apply(this, arguments);
    try {
      if (INTERESTING.test(url)) {
        const clone = response.clone();
        clone.text().then((txt) => push(url, response.status, tryParse(txt))).catch(() => {});
      }
    } catch (_) { /* nunca interfere no portal */ }
    return response;
  };

  const OpenXHR = XMLHttpRequest.prototype.open;
  const SendXHR = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__viaairUrl = String(url || "");
    return OpenXHR.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    this.addEventListener("load", () => {
      try {
        const url = this.__viaairUrl || "";
        if (!INTERESTING.test(url)) return;
        const body =
          this.responseType === "json" ? this.response : tryParse(this.responseText);
        push(url, this.status, body);
      } catch (_) { /* ignora */ }
    });
    return SendXHR.apply(this, arguments);
  };

  window.addEventListener("message", (ev) => {
    if (ev.source !== window || !ev.data || ev.data.__viaairCruise !== "collect") return;
    window.postMessage(
      { __viaairCruise: "collected", xhr: store.slice(-MAX), href: location.href },
      "*",
    );
  });
})();
