/* Via Air Orçamentos — observador MAIN world, instalado em document_start. */
(function () {
  const LOG = "[Via Air Orçamentos]";
  const QUOTE_RE = /https?:\/\/[^\s"'<>]*infotravel\.com\.br\/[^\s"'<>]*(?:orcamento-web|orcamento|proposta|quote)[^\s"'<>]*/i;
  const ACTION_RE = /enviar\s+or[cç]amento\s+web|or[cç]amento\s+web|enviar\s+or[cç]amento|whats?app|compartilhar/i;

  function emit(kind, detail) {
    try {
      window.postMessage({ __viaair_diagnostic: true, kind, detail, href: location.href, top: window === window.top }, "*");
    } catch (_) { /* diagnóstico nunca interfere na Infotravel */ }
  }

  console.info(LOG, "page-hook carregado em document_start", location.href);
  if (document.documentElement) document.documentElement.setAttribute("data-viaair-page-hook", "ok");
  emit("hook", { status: "OK" });

  const originalOpen = window.open;
  window.open = function (url, ...args) {
    const value = String(url || "");
    console.info(LOG, "window.open capturado", value);
    emit("window-open", { url: value || "(sem URL)" });
    const found = value.match(QUOTE_RE);
    if (found) emit("candidate", { url: found[0], mechanism: "window.open" });
    return originalOpen.apply(this, [url, ...args]);
  };
  console.info(LOG, "window.open hooked");
  emit("window-open-hook", { status: "OK" });

  const originalFetch = window.fetch;
  window.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : input && input.url ? input.url : String(input || "");
    const method = (init && init.method) || (input && input.method) || "GET";
    try {
      const response = await originalFetch.apply(this, arguments);
      emit("request", { transport: "fetch", method, url, status: response.status });
      // NÃO gera candidato: só abrir o orçamento na operadora não pode exportar.
      return response;
    } catch (error) {
      emit("request", { transport: "fetch", method, url, status: "ERRO" });
      throw error;
    }
  };

  const nativeOpenXhr = XMLHttpRequest.prototype.open;
  const nativeSendXhr = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__viaairRequest = { method: String(method || "GET"), url: String(url || "") };
    return nativeOpenXhr.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    this.addEventListener("loadend", () => {
      const request = this.__viaairRequest || { method: "GET", url: "" };
      emit("request", { transport: "XHR", method: request.method, url: request.url, status: this.status || "ERRO" });
      // NÃO gera candidato (ver comentário no fetch).
    }, { once: true });
    return nativeSendXhr.apply(this, arguments);
  };

  try {
    const clipboard = navigator.clipboard;
    if (clipboard && typeof clipboard.writeText === "function") {
      const originalWriteText = clipboard.writeText.bind(clipboard);
      clipboard.writeText = function (text) {
        const value = String(text || "");
        emit("clipboard", { captured: true, preview: value.slice(0, 240) });
        const found = value.match(QUOTE_RE);
        if (found) emit("candidate", { url: found[0], mechanism: "clipboard" });
        return originalWriteText(text);
      };
    }
  } catch (error) {
    emit("clipboard-hook", { status: "indisponível", error: String(error) });
  }

  document.addEventListener("click", (event) => {
    const path = typeof event.composedPath === "function" ? event.composedPath() : [event.target];
    const inspected = [];
    let candidateUrl = "";
    for (const node of path) {
      if (!(node instanceof Element)) continue;
      const attrs = Array.from(node.attributes || []).map((attr) => `${attr.name}=${attr.value}`).join(" ");
      const text = [node.textContent, node.getAttribute("aria-label"), node.getAttribute("title"), attrs]
        .filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
      if (text) inspected.push(`${node.tagName.toLowerCase()}: ${text.slice(0, 220)}`);
      const href = node.getAttribute("href") || "";
      if (!candidateUrl && href) candidateUrl = href;
    }
    const joined = inspected.join(" | ");
    if (!ACTION_RE.test(joined)) return;
    console.info(LOG, "Ação de orçamento detectada", joined);
    emit("action", { text: joined.slice(0, 900), candidateUrl });
    // arma a janela de intenção: só a partir daqui um link vira importação
    emit("intent", { text: joined.slice(0, 200) });
    const found = candidateUrl.match(QUOTE_RE);
    if (found) emit("candidate", { url: found[0], mechanism: "click/composedPath" });
  }, true);

  for (const method of ["pushState", "replaceState"]) {
    const original = history[method];
    history[method] = function (...args) {
      const result = original.apply(this, args);
      emit("navigation", { method, url: String(args[2] || location.href) });
      return result;
    };
  }
})();