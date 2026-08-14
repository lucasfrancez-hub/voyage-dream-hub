/* Via Air Orçamentos — diagnóstico e ponte isolada em todos os frames. */
(function () {
  const LOG = "[Via Air Orçamentos]";
  const ROOT_ID = "viaair-extension-root";
  const IS_TOP = window === window.top;
  const FRAME_LABEL = IS_TOP ? "top" : "iframe";
  const QUOTE_RE = /https?:\/\/[^\s"'<>]*infotravel\.com\.br\/[^\s"'<>]*(?:orcamento-web|orcamento|proposta|quote)[^\s"'<>]*/i;
  const state = {
    content: "OK", hook: document.documentElement.getAttribute("data-viaair-page-hook") === "ok" ? "OK" : "—", frame: FRAME_LABEL, domain: location.hostname,
    click: "—", open: "—", fetch: "—", xhr: "—", clipboard: "—",
    candidate: "—", api: "aguardando URL real", requests: [], report: [],
  };
  let shadow = null;
  let minimized = (() => { try { return localStorage.getItem("viaair-diag-min") === "1"; } catch (_e) { return false; } })();
  let observationUntil = 0;
  let toastTimer = null;
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

  function ensureViaAirUi() {
    if (document.documentElement.getAttribute("data-viaair-page-hook") === "ok") state.hook = "OK";
    if (!IS_TOP) return;
    let host = document.getElementById(ROOT_ID);
    if (host && host.shadowRoot) { shadow = host.shadowRoot; render(); return; }
    const parent = document.body || document.documentElement;
    if (!parent) return;
    host = document.createElement("div");
    host.id = ROOT_ID;
    host.style.cssText = "all:initial;position:fixed;top:20px;right:20px;z-index:2147483647;display:block;";
    shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        *{box-sizing:border-box}.box{width:350px;max-height:calc(100vh - 40px);overflow:auto;background:#102a43;color:#f7fafc;border:1px solid #f26b1f;border-radius:8px;box-shadow:0 16px 44px rgba(0,0,0,.42);font:12px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:0}
        .head{padding:12px 14px;background:#f26b1f;color:#fff;font-weight:800;display:flex;align-items:center;justify-content:space-between;gap:8px;cursor:pointer}.head small{display:block;font-weight:600;margin-top:2px}.head .toggle{border:0;background:rgba(0,0,0,.18);color:#fff;border-radius:5px;width:24px;height:24px;font:700 14px/1 inherit;cursor:pointer;flex:0 0 auto}.box.min{width:auto}.box.min .body,.box.min .toast{display:none}.box.min .head small{display:none}.box.min .head{padding:8px 10px;border-radius:8px}.body{padding:10px 14px}.row{display:grid;grid-template-columns:105px 1fr;gap:7px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,.07)}.key{color:#a9c1d4}.val{overflow-wrap:anywhere}.ok{color:#58d68d;font-weight:700}.warn{color:#ffd166}.requests{max-height:105px;overflow:auto;margin-top:7px;padding:7px;background:rgba(0,0,0,.18);white-space:pre-wrap;overflow-wrap:anywhere}.actions{display:flex;gap:6px;margin-top:9px}button{border:0;border-radius:5px;padding:6px 8px;background:#f26b1f;color:#fff;font:700 11px/1.2 inherit;cursor:pointer}.toast{display:none;margin:0 14px 12px;padding:10px;border-left:4px solid #f26b1f;background:#173b5e}.toast.show{display:block}.toast.success{border-color:#58d68d}.toast.error{border-color:#ff6b6b}.toast b{display:block}.toast span{color:#c8d8e6}
      </style>
      <section class="box" aria-label="Diagnóstico Via Air Orçamentos">
        <div class="head" id="head"><span><span>Via Air Orçamentos</span><small>Diagnóstico ativo</small></span><button class="toggle" id="toggle" type="button" title="Minimizar/expandir" aria-label="Minimizar ou expandir">–</button></div>
        <div class="body" id="rows"></div>
        <div class="toast" id="toast"><b id="toast-title"></b><span id="toast-detail"></span></div>
      </section>`;
    parent.appendChild(host);
    shadow.getElementById("toggle").onclick = (event) => { event.stopPropagation(); setMinimized(!minimized); };
    shadow.getElementById("head").onclick = () => { if (minimized) setMinimized(false); };
    applyMinimized();
    render();
  }

  function setMinimized(value) {
    minimized = !!value;
    try { localStorage.setItem("viaair-diag-min", minimized ? "1" : "0"); } catch (_e) { /* ignora */ }
    applyMinimized();
  }
  function applyMinimized() {
    if (!shadow) return;
    const box = shadow.querySelector(".box");
    if (box) box.className = minimized ? "box min" : "box";
    const toggle = shadow.getElementById("toggle");
    if (toggle) toggle.textContent = minimized ? "+" : "–";
  }

  function row(label, value, className) {
    return `<div class="row"><span class="key">${escapeHtml(label)}</span><span class="val ${className || ""}">${escapeHtml(String(value))}</span></div>`;
  }
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
  }
  function render() {
    if (!shadow) return;
    applyMinimized();
    const rows = shadow.getElementById("rows");
    if (!rows) return;
    const requests = state.requests.length ? state.requests.slice(-8).join("\n") : "—";
    rows.innerHTML =
      row("Content script", state.content, "ok") + row("Page hook", state.hook, state.hook === "OK" ? "ok" : "warn") +
      row("Frame", state.frame) + row("Domínio", state.domain) + row("Clique detectado", state.click, state.click !== "—" ? "ok" : "") +
      row("window.open", state.open) + row("fetch", state.fetch) + row("XHR", state.xhr) + row("clipboard", state.clipboard) +
      row("URL candidata", state.candidate, state.candidate !== "—" ? "ok" : "") + row("API Via Air", state.api) +
      `<div class="requests">${escapeHtml(requests)}</div><div class="actions"><button id="test-loading">Testar importando</button><button id="test-success">Testar sucesso</button><button id="test-error">Testar erro</button><button id="copy-report">Copiar relatório</button></div>`;
    shadow.getElementById("test-loading").onclick = () => showViaAirToast("loading", "Importando orçamento...", "Teste visual local.");
    shadow.getElementById("test-success").onclick = () => showViaAirToast("success", "Orçamento exportado para Via Air", "Exportado com sucesso.");
    shadow.getElementById("test-error").onclick = () => showViaAirToast("error", "Não foi possível exportar o orçamento.", "Teste visual local.");
    shadow.getElementById("copy-report").onclick = () => {
      const lastRequest = state.requests.filter((item) => /fetch|XHR/.test(item)).slice(-1)[0] || "—";
      const text = [
        `Página/frame onde o botão estava: ${state.frame} — ${location.href}`,
        `Evento que foi detectado: ${state.click}`,
        `Request disparado: ${lastRequest}`,
        `Se abriu nova aba: ${state.open}`,
        `URL encontrada: ${state.candidate}`,
        `Mecanismo que encontrou a URL: ${state.report.slice(-1)[0]?.mechanism || "—"}`,
      ].join("\n");
      navigator.clipboard.writeText(text).then(
        () => showViaAirToast("success", "Relatório copiado", "Cole o diagnóstico para a revisão técnica."),
        () => showViaAirToast("error", "Não foi possível copiar o relatório", "Selecione os dados diretamente no painel."),
      );
    };
  }

  function showViaAirToast(kind, title, detail) {
    ensureViaAirUi();
    if (!shadow) return;
    if (minimized) setMinimized(false);
    const toast = shadow.getElementById("toast");
    toast.className = `toast show ${kind}`;
    shadow.getElementById("toast-title").textContent = title;
    shadow.getElementById("toast-detail").textContent = detail || "";
    if (toastTimer) clearTimeout(toastTimer);
    if (kind !== "loading") toastTimer = setTimeout(() => { toast.className = "toast"; }, 8000);
  }
  window.showViaAirToast = showViaAirToast;

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

  function foundUrl(raw, mechanism) {
    const url = extractQuoteUrl(raw);
    if (!url || seen.has(url)) return;
    seen.add(url);
    state.candidate = url;
    state.report.push({ label: "URL encontrada", value: url, mechanism, frame: FRAME_LABEL });
    reportToTop("candidate", { url, mechanism });
    render();
    if (IS_TOP) importQuote(url, mechanism);
  }

  function importQuote(url, trigger) {
    state.api = "Importando orçamento...";
    render();
    showViaAirToast("loading", "Importando orçamento...", "URL real encontrada; aguardando a Via Air.");
    safeSend({ type: "viaair-quotes-import", url, trigger }, (response, error) => {
      if (error || !response) {
        state.api = `ERRO: ${error || "sem resposta"}`;
        render();
        showViaAirToast("error", "Não foi possível exportar o orçamento.", "A extensão não recebeu resposta da Via Air.");
        return;
      }
      state.api = response.status || "resposta inválida";
      render();
      if (response.status === "READY") showViaAirToast("success", "Orçamento exportado para Via Air", "Exportado com sucesso.");
      else showViaAirToast("error", "Não foi possível exportar o orçamento.", response.detail || response.status || "Erro desconhecido.");
    });
  }

  function handleDiagnostic(kind, detail, frame) {
    if (frame) state.frame = frame;
    if (kind === "hook") state.hook = "OK";
    if (kind === "action") {
      state.click = "Ação de orçamento detectada";
      observationUntil = Date.now() + 15000;
      state.report.push({ label: "Evento", value: detail && detail.text, frame: frame || FRAME_LABEL });
      showViaAirToast("loading", "Ação de orçamento detectada", "Observando requisições, DOM, clipboard e novas abas por 15 segundos.");
      safeSend({ type: "viaair-diagnostic-arm", frameUrl: location.href, detail });
      if (detail && detail.candidateUrl) foundUrl(detail.candidateUrl, "click/composedPath");
    }
    if (kind === "window-open" || kind === "tab-created" || kind === "tab-updated") state.open = detail && detail.url ? detail.url : kind;
    if (kind === "request") {
      const line = `${detail.transport} ${detail.method} ${detail.url} → ${detail.status}`;
      state.requests.push(line);
      if (detail.transport === "fetch") state.fetch = `${detail.method} → ${detail.status}`;
      else state.xhr = `${detail.method} → ${detail.status}`;
    }
    if (kind === "clipboard") state.clipboard = "Clipboard capturado";
    if (kind === "candidate" && detail && detail.url) foundUrl(detail.url, detail.mechanism || "desconhecido");
    render();
  }

  window.addEventListener("message", (event) => {
    const message = event.data;
    if (!message || message.__viaair_diagnostic !== true) return;
    handleDiagnostic(message.kind, message.detail || {}, FRAME_LABEL);
    reportToTop(message.kind, message.detail || {});
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (!message) return;
    if (message.type === "viaair-diagnostic-relay" && IS_TOP) handleDiagnostic(message.kind, message.detail || {}, message.frame || "iframe");
    if (message.type === "viaair-tab-candidate") {
      if (IS_TOP) handleDiagnostic(message.event || "tab-updated", { url: message.tabUrl }, "background");
      if (message.quoteUrl) {
        // o background já importa sozinho; aqui só registramos o candidato
        const url = extractQuoteUrl(message.quoteUrl);
        if (url && !seen.has(url)) {
          seen.add(url);
          state.candidate = url;
          state.report.push({ label: "URL encontrada", value: url, mechanism: message.mechanism || "background/tab", frame: FRAME_LABEL });
          render();
        }
      }
    }
    if (message.type === "viaair-import-progress" && IS_TOP) {
      if (message.stage === "start") {
        state.api = "Importando orçamento...";
        showViaAirToast("loading", "Importando orçamento...", "URL real encontrada; aguardando a Via Air.");
      } else {
        const r = message.result || {};
        state.api = r.status || "sem resposta";
        if (r.status === "READY") showViaAirToast("success", "Orçamento exportado para Via Air", r.label || "Exportado com sucesso.");
        else showViaAirToast("error", "Não foi possível exportar o orçamento.", r.detail || r.status || "Erro desconhecido.");
      }
      render();
    }
  });

  const observer = new MutationObserver((mutations) => {
    ensureViaAirUi();
    if (Date.now() > observationUntil) return;
    for (const mutation of mutations) for (const node of mutation.addedNodes) {
      if (!(node instanceof Element)) continue;
      const sample = `${node.textContent || ""} ${node.getAttribute("href") || ""} ${node.outerHTML || ""}`.slice(0, 5000);
      if (/https?:|infotravel|or[cç]amento|whats?app|copiar|link/i.test(sample)) {
        state.requests.push(`DOM + ${sample.replace(/\s+/g, " ").slice(0, 240)}`);
        foundUrl(sample, "DOM pós-clique");
      }
    }
    render();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  ensureViaAirUi();
  document.addEventListener("DOMContentLoaded", ensureViaAirUi, { once: true });
  setInterval(ensureViaAirUi, 1500);
  reportToTop("content", { status: "OK" });
})();