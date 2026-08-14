/* Via Air Orçamentos — pareamento automático.
 * Roda no portal Via Air (usuário já logado) e entrega o access token da sessão
 * ao service worker, que o troca por um token permanente de extensão.
 * Nenhum token precisa ser copiado manualmente. */
(function () {
  function readSessionToken() {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i) || "";
        if (!/^sb-.*-auth-token$/.test(key)) continue;
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        let parsed = raw;
        if (raw.startsWith("base64-")) {
          try { parsed = atob(raw.slice(7)); } catch (_) { continue; }
        }
        const obj = JSON.parse(parsed);
        const token = obj?.access_token || obj?.currentSession?.access_token;
        if (token && String(token).length > 20) return String(token);
      }
    } catch (_) { /* sessão indisponível */ }
    return null;
  }

  function pair() {
    const accessToken = readSessionToken();
    if (!accessToken) return;
    try {
      chrome.runtime.sendMessage(
        { type: "viaair-quotes-auto-pair", accessToken },
        () => void chrome.runtime.lastError,
      );
    } catch (_) { /* extensão recarregando */ }
  }

  pair();
  // Login pode acontecer depois do carregamento da página.
  setTimeout(pair, 4000);
  setTimeout(pair, 15000);
  window.addEventListener("focus", pair);
})();
