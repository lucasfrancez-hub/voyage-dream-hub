/* Via Air — bridge content script
 *
 * Roda nas páginas do admin da Via Air (Lovable preview/prod + domínio
 * custom). Escuta window.postMessage vindo do próprio admin com o token
 * gerado e persiste em chrome.storage.local sob a chave da companhia,
 * pra que o content.js leia quando a página da cia abrir.
 */
(function () {
  const VERSION = "1.7.11";
  const API_BASE = "https://pedidos.viaair.tur.br";

  function announce() {
    window.postMessage({ __viaair: "ready", version: VERSION }, "*");
  }

  window.addEventListener("message", (ev) => {
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d) return;

    // Ping do admin — respondemos com nossa versão.
    if (d.__viaair === "ping") { announce(); return; }

    if (d.__viaair !== "set-token") return;
    const { token, airline } = d;
    if (!token || !airline) return;
    const ALL = ["latam", "gol", "azul", "skyteam", "frt", "visualturismo", "infotera"];
    const targets = airline === "any"
      ? ALL
      : (ALL.includes(airline) ? [airline] : []);
    if (targets.length === 0) return;
    try {
      const payload = {};
      for (const a of targets) {
        payload["viaair::" + a] = { token, apiBase: API_BASE, airline: a, savedAt: Date.now() };
      }
      chrome.storage.local.set(payload, () => {
        window.postMessage({ __viaair: "set-token-ack", airline }, "*");
      });
    } catch (e) {
      window.postMessage({ __viaair: "set-token-err", error: String(e) }, "*");
    }
  });

  // Anúncio inicial + reanuncia depois pra pegar listeners que subiram depois.
  announce();
  setTimeout(announce, 500);
  setTimeout(announce, 2000);
})();
