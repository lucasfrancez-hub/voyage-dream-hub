/* Via Air Orçamentos — hook em contexto MAIN.
 * Intercepta window.open, cliques e mudanças de histórico sem bloquear
 * a ação original da operadora. Apenas observa e avisa o content script. */
(function () {
  const RE = /https?:\/\/[^\s"'<>]*infotravel\.com\.br\/[^\s"'<>]*/i;

  function report(url, trigger) {
    if (!url) return;
    try {
      window.postMessage({ __viaair_quote: true, url: String(url), trigger }, "*");
    } catch (_) {
      /* ignora */
    }
  }

  const nativeOpen = window.open;
  window.open = function (url, ...rest) {
    try {
      if (url && RE.test(String(url))) report(url, "window.open");
      else if (url && /whatsapp|api\.whatsapp|wa\.me/i.test(String(url))) report(url, "whatsapp");
    } catch (_) {
      /* ignora */
    }
    // nunca bloquear o fluxo original
    return nativeOpen.apply(window, [url, ...rest]);
  };

  document.addEventListener(
    "click",
    (e) => {
      const a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
      if (!a) return;
      const href = a.getAttribute("href") || "";
      if (RE.test(href) || /whatsapp|wa\.me/i.test(href)) report(href, "link");
    },
    true,
  );

  for (const method of ["pushState", "replaceState"]) {
    const original = history[method];
    history[method] = function (...args) {
      try {
        const url = args[2];
        if (url && RE.test(String(url))) report(new URL(url, location.href).toString(), "history");
      } catch (_) {
        /* ignora */
      }
      return original.apply(this, args);
    };
  }
})();
