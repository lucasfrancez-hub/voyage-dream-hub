/* Via Air Orçamentos — botão flutuante arrastável com status da importação. */
(function () {
  const LOG = "[Via Air Orçamentos]";
  const ROOT_ID = "viaair-extension-root";
  const IS_TOP = window === window.top;
  const FRAME_LABEL = IS_TOP ? "top" : "iframe";
  const POS_KEY = "viaair-fab-pos";
  const QUOTE_RE = /https?:\/\/[^\s"'<>]*infotravel\.com\.br\/[^\s"'<>]*(?:orcamento-web|orcamento|proposta|quote)[^\s"'<>]*/i;

  let shadow = null;
  let statusKind = "idle"; // idle | sending | done | error
  let statusText = "Via Air";
  let statusDetail = "";
  let resetTimer = null;
  const seen = new Set();

  console.log(LOG, "Content script carregado", { href: location.href, frame: FRAME_LABEL });

  function safeSend(message, callback) {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) return callback && callback(null, chrome.runtime.lastError.message);
        if (callback) callback(response, null);
      });
    } catch (error) { if (callback) callback(null, String(error)); }
  }

  function readPos() {
    try {
      const raw = JSON.parse(localStorage.getItem(POS_KEY) || "null");
      if (raw && typeof raw.top === "number" && typeof raw.left === "number") return raw;
    } catch (_e) { /* ignora */ }
    return null;
  }
  function savePos(pos) {
    try { localStorage.setItem(POS_KEY, JSON.stringify(pos)); } catch (_e) { /* ignora */ }
  }

  function ensureUi() {
    if (!IS_TOP) return;
    let host = document.getElementById(ROOT_ID);
    if (host && host.shadowRoot) { shadow = host.shadowRoot; render(); return; }
    const parent = document.body || document.documentElement;
    if (!parent) return;

    host = document.createElement("div");
    host.id = ROOT_ID;
    const pos = readPos();
    host.style.cssText =
      "all:initial;position:fixed;z-index:2147483647;display:block;" +
      (pos ? `top:${pos.top}px;left:${pos.left}px;` : "bottom:24px;right:24px;");
    shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        *{box-sizing:border-box}
        .fab{display:flex;align-items:center;gap:9px;padding:10px 16px;border-radius:999px;background:#102a43;color:#fff;
          border:1px solid rgba(242,107,31,.9);box-shadow:0 10px 28px rgba(0,0,0,.35);
          font:700 12.5px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;cursor:grab;user-select:none;white-space:nowrap;
          transition:background .18s ease,border-color .18s ease}
        .fab.drag{cursor:grabbing}
        .fab .dot{width:9px;height:9px;border-radius:50%;background:#f26b1f;flex:0 0 auto}
        .fab.sending{background:#173b5e;border-color:#ffd166}
        .fab.sending .dot{background:#ffd166;animation:pulse 1s infinite ease-in-out}
        .fab.done{background:#0f3d2e;border-color:#58d68d}
        .fab.done .dot{background:#58d68d}
        .fab.error{background:#4a1620;border-color:#ff6b6b}
        .fab.error .dot{background:#ff6b6b}
        .txt{display:flex;flex-direction:column;gap:2px}
        .detail{font:600 10.5px/1.2 inherit;color:#c8d8e6;max-width:230px;overflow:hidden;text-overflow:ellipsis}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
      </style>
      <div class="fab" id="fab" title="Via Air Orçamentos — arraste para posicionar">
        <span class="dot"></span>
        <span class="txt"><span id="label">Via Air</span><span class="detail" id="detail"></span></span>
      </div>`;
    parent.appendChild(host);
    setupDrag(host, shadow.getElementById("fab"));
    render();
  }

  function setupDrag(host, fab) {
    let dragging = false, moved = false, offsetX = 0, offsetY = 0;
    fab.addEventListener("pointerdown", (event) => {
      const rect = host.getBoundingClientRect();
      dragging = true; moved = false;
      offsetX = event.clientX - rect.left;
      offsetY = event.clientY - rect.top;
      host.style.top = `${rect.top}px`;
      host.style.left = `${rect.left}px`;
      host.style.bottom = "auto"; host.style.right = "auto";
      fab.classList.add("drag");
      fab.setPointerCapture(event.pointerId);
    });
    fab.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      moved = true;
      const rect = host.getBoundingClientRect();
      const top = Math.max(4, Math.min(window.innerHeight - rect.height - 4, event.clientY - offsetY));
      const left = Math.max(4, Math.min(window.innerWidth - rect.width - 4, event.clientX - offsetX));
      host.style.top = `${top}px`;
      host.style.left = `${left}px`;
    });
    const end = (event) => {
      if (!dragging) return;
      dragging = false;
      fab.classList.remove("drag");
      try { fab.releasePointerCapture(event.pointerId); } catch (_e) { /* ignora */ }
      const rect = host.getBoundingClientRect();
      if (moved) savePos({ top: rect.top, left: rect.left });
    };
    fab.addEventListener("pointerup", end);
    fab.addEventListener("pointercancel", end);
  }

  function setStatus(kind, text, detail, autoReset) {
    statusKind = kind; statusText = text; statusDetail = detail || "";
    ensureUi(); render();
    if (resetTimer) clearTimeout(resetTimer);
    if (autoReset) resetTimer = setTimeout(() => setStatus("idle", "Via Air", ""), autoReset);
  }

  function render() {
    if (!shadow) return;
    const fab = shadow.getElementById("fab");
    if (!fab) return;
    fab.className = `fab ${statusKind === "idle" ? "" : statusKind}`;
    shadow.getElementById("label").textContent = statusText;
    const detail = shadow.getElementById("detail");
    detail.textContent = statusDetail;
    detail.style.display = statusDetail ? "block" : "none";
  }

  // API interna usada pelo page-hook
  window.showViaAirToast = function (kind, title, detail) {
    if (kind === "loading") setStatus("sending", "Enviando…", detail || "");
    else if (kind === "success") setStatus("done", "Concluído", detail || "", 12000);
    else setStatus("error", "Falhou", detail || "", 15000);
  };

  function reportToTop(kind, detail) {
    safeSend({ type: "viaair-diagnostic-event", kind, detail, frame: FRAME_LABEL, frameUrl: location.href });
  }

  function extractQuoteUrl(raw) {
    if (!raw) return null;
    let value = String(raw);
    for (let i = 0; i < 3; i++) { try { const next = decodeURIComponent(value); if (next === value) break; value = next; } catch (_) { break; } }
    const direct = value.match(QUOTE_RE);
    if (direct) return direct[0].replace(/[).,;]+$/, "");
    try {
      const parsed = new URL(value, location.href);
      const text = parsed.searchParams.get("text") || parsed.searchParams.get("body");
      if (text) return extractQuoteUrl(text);
    } catch (_) { /* não é URL */ }
    return null;
  }

  // Só estes mecanismos representam a ação de ENVIAR o orçamento. Abrir/navegar
  // pelo site da operadora nunca pode exportar de novo (evita duplicidade).
  const INTENT_MECHANISMS = /^(window\.open|clipboard|click\/composedPath|manual)/;

  function foundUrl(raw, mechanism) {
    if (!INTENT_MECHANISMS.test(String(mechanism || ""))) return;
    const url = extractQuoteUrl(raw);
    if (!url || seen.has(url)) return;
    seen.add(url);
    reportToTop("candidate", { url, mechanism });
    if (IS_TOP) importQuote(url, mechanism);
  }

  function importQuote(url, trigger) {
    setStatus("sending", "Enviando…", "Importando orçamento para a Via Air");
    safeSend({ type: "viaair-quotes-import", url, trigger }, (response, error) => {
      if (error || !response) {
        // o background pode concluir sozinho e avisar por viaair-import-progress
        setStatus("sending", "Enviando…", "Aguardando a Via Air");
        return;
      }
      applyResult(response);
    });
  }

  function applyResult(result) {
    const r = result || {};
    if (r.status === "READY" || r.quoteId) setStatus("done", "Concluído", r.label || "Orçamento importado", 12000);
    else if (r.status === "PROCESSING" || r.status === "QUEUED") setStatus("sending", "Processando…", "A Via Air ainda está lendo o orçamento");
    else setStatus("error", "Falhou", r.detail || r.status || "Erro desconhecido", 15000);
  }

  window.addEventListener("message", (event) => {
    const message = event.data;
    if (!message || message.__viaair_diagnostic !== true) return;
    const kind = message.kind;
    const detail = message.detail || {};
    if (kind === "intent") safeSend({ type: "viaair-send-intent" });
    if (kind === "candidate" && detail.url) foundUrl(detail.url, detail.mechanism || "page-hook");
    reportToTop(kind, detail);
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (!message || !IS_TOP) return;
    if (message.type === "viaair-tab-candidate" && message.quoteUrl) {
      const url = extractQuoteUrl(message.quoteUrl);
      if (url && !seen.has(url)) { seen.add(url); setStatus("sending", "Enviando…", "Orçamento detectado"); }
    }
    if (message.type === "viaair-import-progress") {
      if (message.stage === "start") setStatus("sending", "Enviando…", "Importando orçamento para a Via Air");
      else applyResult(message.result);
    }
  });

  // Observador só mantém o botão na tela: varrer o DOM em busca de links
  // exportava o orçamento sozinho ao reabrir a página.
  const observer = new MutationObserver(() => ensureUi());
  observer.observe(document.documentElement, { childList: true, subtree: true });

  ensureUi();
  document.addEventListener("DOMContentLoaded", ensureUi, { once: true });
  setInterval(ensureUi, 2000);
  reportToTop("content", { status: "OK" });
})();
