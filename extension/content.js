/* Via Air — content script (MV3)
 *
 * Fluxo:
 * 1. Ao carregar página da LATAM/GOL/AZUL, procuramos por um token na URL
 *    (fragmento #viaair=BASE64 ou query ?viaair=BASE64). Se achamos,
 *    persistimos {token, apiBase, airline_hint} em chrome.storage.local
 *    ligado ao host+path da reserva.
 * 2. Injetamos um botão flutuante "📥 Importar pra Via Air".
 * 3. Ao clicar, capturamos innerText do conteúdo principal e mandamos
 *    POST para {apiBase}/api/public/import-aereo.
 */

(function () {
  const HOST = location.hostname;

  // Todas as origens suportadas. `key` é usado como airline_hint no backend
  // e como sufixo em chrome.storage.local ("viaair::" + key).
  const SOURCES = [
    { key: "latam",        match: (h) => h.includes("latamairlines") },
    { key: "gol",          match: (h) => h.includes("voegol") },
    { key: "azul",         match: (h) => h.includes("voeazul") },
    { key: "skyteam",      match: (h) => h.includes("portal.skyteam.tur.br") },
    { key: "frt",          match: (h) => h.startsWith("frt.infotravel") },
    { key: "visualturismo",match: (h) => h.startsWith("visualturismo.infotravel") },
    { key: "infotera",     match: (h) => h.includes("infotravel.com.br") }, // fallback genérico
  ];

  const source = SOURCES.find((s) => s.match(HOST));
  if (!source) return;
  const airline = source.key;

  const storageKey = "viaair::" + airline;
  const legacyStorageKey = "viaair::" + HOST;

  function parseViaAirPayload() {
    // Compat: fluxo antigo com #viaair=BASE64 (mantido pra transição).
    const sources = [location.hash.replace(/^#/, ""), location.search.replace(/^\?/, "")];
    for (const src of sources) {
      const params = new URLSearchParams(src);
      const raw = params.get("viaair");
      if (!raw) continue;
      try {
        const json = atob(raw.replace(/-/g, "+").replace(/_/g, "/"));
        const obj = JSON.parse(json);
        if (obj && obj.token && obj.apiBase) return obj;
      } catch (e) { /* ignore */ }
    }
    return null;
  }

  async function loadCtx() {
    const payload = parseViaAirPayload();
    if (payload) {
      await chrome.storage.local.set({ [storageKey]: { ...payload, airline, savedAt: Date.now() } });
      return { ...payload, airline };
    }
    const stored = await chrome.storage.local.get([storageKey, legacyStorageKey]);
    return stored[storageKey] || stored[legacyStorageKey] || null;
  }

  function collectPageText() {
    // Pega TODO o texto do DOM (inclusive abas/painéis colapsados por CSS
    // e conteúdo abaixo da rolagem — o DOM está inteiro carregado).
    // textContent > innerText porque innerText ignora elementos hidden.
    const clone = document.body.cloneNode(true);

    // Portais ASP.NET (SkyTeam/Infotera) mostram dados dentro de <input value="...">;
    // convertemos em texto antes de remover os campos.
    clone.querySelectorAll("input,select,textarea").forEach((el) => {
      const v = el.value || el.getAttribute("value") || "";
      if (v && v.trim()) {
        const label = el.getAttribute("name") || el.getAttribute("id") || "";
        el.replaceWith(document.createTextNode(` ${label ? label + ": " : ""}${v} `));
      } else {
        el.remove();
      }
    });
    clone.querySelectorAll("script,style,noscript,svg,iframe,button").forEach((n) => n.remove());

    // Preserva quebras de linha em tabelas/listas — importantes em portais ASP.NET.
    clone.querySelectorAll("tr,li,p,div,br,td,th").forEach((n) => n.appendChild(document.createTextNode("\n")));

    const text = clone.textContent || "";
    return text
      .replace(/[ \t\u00a0]+/g, " ")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function showToast(msg, kind) {
    let el = document.getElementById("viaair-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "viaair-toast";
      Object.assign(el.style, {
        position: "fixed", right: "16px", bottom: "80px", zIndex: "2147483647",
        padding: "10px 14px", borderRadius: "10px", color: "#fff",
        fontFamily: "system-ui, -apple-system, sans-serif", fontSize: "14px",
        boxShadow: "0 10px 30px rgba(0,0,0,.25)", maxWidth: "320px",
      });
      document.body.appendChild(el);
    }
    el.style.background = kind === "err" ? "#b91c1c" : (kind === "ok" ? "#15803d" : "#0f172a");
    el.textContent = msg;
    clearTimeout(el.__t);
    el.__t = setTimeout(() => { el.remove(); }, 5000);
  }

  async function sendImport(ctx) {
    const rawText = collectPageText();
    if (rawText.length < 200) {
      showToast("Página ainda não carregou os dados da reserva. Aguarde e tente de novo.", "err");
      return;
    }
    showToast("Enviando dados pra Via Air…");
    try {
      const res = await fetch(ctx.apiBase.replace(/\/+$/, "") + "/api/public/import-aereo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token: ctx.token,
          airline_hint: airline,
          source_url: location.href,
          raw_text: rawText,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const map = {
          token_not_found: "Token não encontrado. Gere um novo no pedido.",
          already_consumed: "Essa reserva já foi importada.",
          token_expired: "Token expirou (2 h). Gere um novo no pedido.",
          raw_text_too_short: "Página ainda vazia. Aguarde carregar e tente de novo.",
          ai_failed: "A IA não conseguiu ler a página. Tente de novo.",
        };
        showToast(map[body.error] || ("Erro: " + (body.error || res.status)), "err");
        return;
      }
      showToast("✅ Dados enviados! Volte ao admin da Via Air pra conferir.", "ok");
    } catch (e) {
      showToast("Falha de rede: " + e.message, "err");
    }
  }

  async function ensureButton() {
    if (document.getElementById("viaair-btn")) return;
    const ctx = await loadCtx();
    if (!ctx) return;

    const btn = document.createElement("button");
    btn.id = "viaair-btn";
    btn.type = "button";
    btn.textContent = "📥 Importar pra Via Air";
    Object.assign(btn.style, {
      position: "fixed", right: "16px", bottom: "16px", zIndex: "2147483647",
      background: "linear-gradient(135deg,#0f172a,#1e40af)", color: "#fff",
      border: "none", borderRadius: "999px", padding: "12px 18px",
      fontFamily: "system-ui, -apple-system, sans-serif",
      fontSize: "14px", fontWeight: "600", cursor: "pointer",
      boxShadow: "0 10px 30px rgba(0,0,0,.35)",
    });
    btn.onmouseenter = () => (btn.style.filter = "brightness(1.15)");
    btn.onmouseleave = () => (btn.style.filter = "none");
    btn.onclick = () => sendImport(ctx);
    document.body.appendChild(btn);
  }

  // O SPA das cias troca de rota sem recarregar — observamos mudanças.
  const mo = new MutationObserver(() => { ensureButton(); });
  mo.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("hashchange", ensureButton);
  window.addEventListener("popstate", ensureButton);
  setTimeout(ensureButton, 1500);
  setTimeout(ensureButton, 4000);
})();
