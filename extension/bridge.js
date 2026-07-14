/* Via Air — bridge content script
 *
 * Roda nas páginas do admin da Via Air (Lovable preview/prod + domínio
 * custom). Escuta window.postMessage vindo do próprio admin com o token
 * gerado e persiste em chrome.storage.local sob a chave da companhia,
 * pra que o content.js leia quando a página da cia abrir.
 */
(function () {
  window.addEventListener("message", (ev) => {
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || d.__viaair !== "set-token") return;
    const { token, apiBase, airline } = d;
    if (!token || !apiBase || !airline) return;
    if (!["latam", "gol", "azul"].includes(airline)) return;
    try {
      chrome.storage.local.set({
        ["viaair::" + airline]: { token, apiBase, airline, savedAt: Date.now() },
      }, () => {
        window.postMessage({ __viaair: "set-token-ack", airline }, "*");
      });
    } catch (e) {
      window.postMessage({ __viaair: "set-token-err", error: String(e) }, "*");
    }
  });

  // Sinaliza pro admin que a extensão está instalada e ativa.
  window.postMessage({ __viaair: "ready", version: "1.1.0" }, "*");
})();
