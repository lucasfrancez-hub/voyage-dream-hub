/* Via Air Orçamentos — content script.
 * Detecta ambiente Infotravel, injeta o botão flutuante de status e captura
 * automaticamente a URL do orçamento web. Não bloqueia nada da operadora. */
(function () {
  const LOG = "[Via Air Orçamentos]";
  console.info(LOG, "Content script carregado", { url: location.href, host: location.hostname });
  const QUOTE_RE = /https?:\/\/[^\s"'<>]*infotravel\.com\.br\/[^\s"'<>]*(orcamento|proposta|quote)[^\s"'<>]*/i;

  function isSupportedInfotravelPage() {
    const host = location.hostname;
    if (!/infotravel\.com\.br$/i.test(host) && !/\/infotravel\//i.test(location.pathname)) return false;
    return true;
  }
  if (!isSupportedInfotravelPage()) {
    console.warn(LOG, "página NÃO reconhecida como Infotravel — encerrando", location.hostname);
    return;
  }
  console.info(LOG, "Infotravel detectada:", location.hostname);

  /* ---------- extração da URL do orçamento (inclusive dentro do WhatsApp) ---------- */
  function decodeDeep(value) {
    let out = String(value || "");
    for (let i = 0; i < 3; i++) {
      try {
        const next = decodeURIComponent(out);
        if (next === out) break;
        out = next;
      } catch (_) {
        break;
      }
    }
    return out;
  }

  function extractQuoteUrl(raw) {
    if (!raw) return null;
    const decoded = decodeDeep(raw);
    const direct = decoded.match(QUOTE_RE);
    if (direct) return direct[0].replace(/[).,;]+$/, "");
    try {
      const u = new URL(decoded, location.href);
      const text = u.searchParams.get("text") || u.searchParams.get("body");
      if (text) {
        const inner = decodeDeep(text).match(QUOTE_RE);
        if (inner) return inner[0].replace(/[).,;]+$/, "");
      }
    } catch (_) {
      /* ignora */
    }
    return null;
  }

  /* ---------- botão flutuante ---------- */
  const LOGO = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 13.5 21 4l-4.2 9.2L21 20l-8.6-3.4L6 21l1.6-5.2L3 13.5Z" fill="#F26B1F"/></svg>`;

  const host = document.createElement("div");
  host.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483000;";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      .btn{display:flex;align-items:center;gap:8px;background:#0d2b45;color:#fff;border:1px solid rgba(242,107,31,.5);
        border-radius:999px;padding:8px 14px;font:600 12px/1.2 -apple-system,Segoe UI,Roboto,sans-serif;
        box-shadow:0 8px 24px rgba(0,0,0,.28);cursor:pointer;user-select:none;transition:.2s}
      .btn:hover{border-color:#F26B1F}
      .dot{width:7px;height:7px;border-radius:50%;background:#22c55e}
      .dot.warn{background:#f59e0b}.dot.err{background:#ef4444}.dot.busy{background:#38bdf8}
      .panel{margin-top:8px;width:250px;background:#0d2b45;color:#e8eef5;border:1px solid rgba(255,255,255,.12);
        border-radius:12px;padding:12px;font:400 12px/1.45 -apple-system,Segoe UI,Roboto,sans-serif;display:none;
        box-shadow:0 12px 32px rgba(0,0,0,.35)}
      .panel.open{display:block}
      .panel h4{margin:0 0 6px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#F26B1F}
      .muted{color:#9db0c4;font-size:11px}
      .row{margin-top:8px}
      a,button.link{color:#F26B1F;background:none;border:0;padding:0;font:inherit;cursor:pointer;text-decoration:none}
    </style>
    <div class="panel" id="panel">
      <h4>Via Air Orçamentos</h4>
      <div id="state" class="muted">Verificando conexão…</div>
      <div class="row"><div class="muted">Último orçamento</div><div id="last">—</div></div>
      <div class="row"><div class="muted">Pendentes de sincronização: <span id="pending">0</span></div></div>
      <div class="row"><a href="https://pedidos.viaair.tur.br/admin/orcamentos" target="_blank">Abrir na Via Air</a></div>
      <div class="row"><button class="link" id="retry">Reprocessar pendentes</button></div>
    </div>
    <div class="btn" id="btn"><span class="dot" id="dot"></span>${LOGO}<span id="label">Via Air</span></div>
  `;
  document.documentElement.appendChild(host);
  console.info(LOG, "Botão flutuante injetado no DOM");
  // reinjeção defensiva caso a SPA remova o host
  new MutationObserver(() => {
    if (!host.isConnected) {
      document.documentElement.appendChild(host);
      console.warn(LOG, "Botão removido pela SPA — reinjetado");
    }
  }).observe(document.documentElement, { childList: true });

  const el = (id) => shadow.getElementById(id);
  let resetTimer = null;

  function setState(label, kind) {
    el("label").textContent = label;
    el("dot").className = "dot" + (kind ? " " + kind : "");
    if (resetTimer) clearTimeout(resetTimer);
    if (kind !== "idle") {
      resetTimer = setTimeout(refreshStatus, 6000);
    }
  }

  el("btn").addEventListener("click", () => {
    el("panel").classList.toggle("open");
    refreshStatus();
  });
  el("retry").addEventListener("click", () => chrome.runtime.sendMessage({ type: "viaair-quotes-flush" }));

  function refreshStatus() {
    chrome.runtime.sendMessage({ type: "viaair-quotes-status" }, (res) => {
      if (chrome.runtime.lastError || !res) {
        console.error(LOG, "status indisponível (service worker)", chrome.runtime.lastError?.message);
        return;
      }
      el("pending").textContent = String(res.pending || 0);
      el("state").textContent = res.connected ? "Conectado" : "Token não configurado";
      el("last").textContent = res.last
        ? `${res.last.label || "Orçamento"} — ${res.last.result || ""}`
        : "—";
      setState(res.connected ? "Via Air" : "Conectar", res.connected ? "idle" : "warn");
      el("dot").className = "dot" + (res.connected ? "" : " warn");
    });
  }
  refreshStatus();

  /* ---------- toast Via Air (canto superior direito) ---------- */
  const toastHost = document.createElement("div");
  toastHost.style.cssText = "position:fixed;top:16px;right:16px;z-index:2147483001;";
  const toastShadow = toastHost.attachShadow({ mode: "open" });
  toastShadow.innerHTML = `
    <style>
      .t{display:none;min-width:280px;max-width:360px;background:#0d2b45;color:#e8eef5;
        border:1px solid rgba(255,255,255,.12);border-left:4px solid #F26B1F;border-radius:12px;
        padding:12px 14px;font:400 12.5px/1.45 -apple-system,Segoe UI,Roboto,sans-serif;
        box-shadow:0 14px 38px rgba(0,0,0,.38)}
      .t.show{display:flex;gap:10px;align-items:flex-start}
      .t.ok{border-left-color:#22c55e}.t.err{border-left-color:#ef4444}.t.warn{border-left-color:#f59e0b}
      .ttl{font-weight:700;font-size:12.5px}
      .sub{color:#9db0c4;font-size:11.5px;margin-top:2px}
      .act{margin-top:8px;display:inline-block;color:#F26B1F;font-weight:600;cursor:pointer;text-decoration:none;font-size:11.5px}
      .sp{animation:spin 1s linear infinite;transform-origin:50% 50%}
      @keyframes spin{to{transform:rotate(360deg)}}
      .x{margin-left:auto;color:#9db0c4;cursor:pointer;font-size:14px;line-height:1}
    </style>
    <div class="t" id="t">
      <span id="icon"></span>
      <div style="flex:1">
        <div class="ttl" id="ttl"></div>
        <div class="sub" id="sub"></div>
        <a class="act" id="act" target="_blank" style="display:none">Abrir na Via Air</a>
      </div>
      <span class="x" id="x">✕</span>
    </div>`;
  document.documentElement.appendChild(toastHost);
  new MutationObserver(() => {
    if (!toastHost.isConnected) document.documentElement.appendChild(toastHost);
  }).observe(document.documentElement, { childList: true });

  const ICONS = {
    loading: `<svg class="sp" width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#F26B1F" stroke-width="2.5" stroke-dasharray="40" stroke-linecap="round"/></svg>`,
    success: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="m5 13 4 4 10-10" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    duplicate: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="4" y="4" width="12" height="12" rx="2" stroke="#38bdf8" stroke-width="2"/><rect x="8" y="8" width="12" height="12" rx="2" stroke="#38bdf8" stroke-width="2"/></svg>`,
    error: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 7v6M12 17h.01" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round"/><circle cx="12" cy="12" r="9" stroke="#ef4444" stroke-width="2"/></svg>`,
    auth: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="4" y="10" width="16" height="10" rx="2" stroke="#f59e0b" stroke-width="2"/><path d="M8 10V7a4 4 0 1 1 8 0v3" stroke="#f59e0b" stroke-width="2"/></svg>`,
  };
  const tEl = (id) => toastShadow.getElementById(id);
  let toastTimer = null;
  tEl("x").addEventListener("click", () => tEl("t").classList.remove("show"));

  function toast(kind, title, sub, link) {
    const box = tEl("t");
    box.className = "t show" + (kind === "success" || kind === "duplicate" ? " ok" : kind === "error" ? " err" : kind === "auth" ? " warn" : "");
    tEl("icon").innerHTML = ICONS[kind] || ICONS.loading;
    tEl("ttl").textContent = title;
    tEl("sub").textContent = sub || "";
    const act = tEl("act");
    if (link) {
      act.href = link;
      act.style.display = "inline-block";
    } else act.style.display = "none";
    if (toastTimer) clearTimeout(toastTimer);
    if (kind === "success" || kind === "duplicate") toastTimer = setTimeout(() => box.classList.remove("show"), 6000);
  }

  /* ---------- captura ---------- */
  const seen = new Set();
  function capture(raw, trigger) {
    const url = extractQuoteUrl(raw);
    if (!url) {
      console.warn(LOG, "ação detectada, mas nenhuma URL de orçamento reconhecida em:", String(raw).slice(0, 300), "| gatilho:", trigger);
      return;
    }
    if (seen.has(url)) {
      console.info(LOG, "URL já processada nesta aba (ignorada):", url);
      return;
    }
    seen.add(url);
    console.info(LOG, "URL detectada:", url, "| gatilho:", trigger);
    setState("Importando orçamento…", "busy");
    toast("loading", "Importando orçamento...", "Lendo os dados da proposta na Infotravel.");
    chrome.runtime.sendMessage({ type: "viaair-quotes-import", url, trigger }, (res) => {
      if (chrome.runtime.lastError || !res) {
        console.error(LOG, "service worker não respondeu:", chrome.runtime.lastError?.message);
        setState("Não foi possível importar", "err");
        return toast("error", "Não foi possível importar os dados do orçamento.", "A extensão não conseguiu falar com o serviço.");
      }
      console.info(LOG, "API respondeu:", res.status);
      if (res.status === "READY") {
        setState(res.duplicate ? "Orçamento já importado" : "Orçamento importado", "");
        if (res.duplicate) toast("duplicate", "Orçamento já importado", res.label || "", res.quoteUrl);
        else toast("success", "✓ Orçamento exportado para Via Air", "Exportado com sucesso.", res.quoteUrl);
      } else if (res.status === "IMPORT_ERROR") {
        setState("Falha na importação", "err");
        toast("error", "Não foi possível importar os dados do orçamento.", res.detail || "Abra a Via Air e use Reprocessar.");
      } else if (res.status === "QUEUED") {
        setState("Pendente — tentaremos novamente", "warn");
        toast("loading", "Sem conexão com a Via Air", "O orçamento ficou na fila e será reenviado.");
      } else if (res.status === "UNAUTHORIZED") {
        setState("Erro de autenticação", "err");
        toast("auth", "Conecte a extensão à Via Air", "Abra o ícone da extensão e conclua a conexão.");
      } else {
        setState("Importando orçamento…", "busy");
        toast("loading", "Importando orçamento...", "Ainda processando na Via Air.");
      }
    });
  }


  window.addEventListener("message", (e) => {
    const d = e.data;
    if (d && d.__viaair_quote && d.url) capture(d.url, d.trigger || "page");
  });

  // links de orçamento que aparecem no DOM (inclusive dentro do texto do WhatsApp)
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        const anchors = node.matches?.("a[href]") ? [node] : node.querySelectorAll?.("a[href]") ?? [];
        for (const a of anchors) {
          const href = a.getAttribute("href") || "";
          if (/infotravel\.com\.br/i.test(href) || /whatsapp|wa\.me/i.test(href)) {
            const found = extractQuoteUrl(href);
            if (found) capture(found, "dom");
          }
        }
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "viaair-quotes-updated") refreshStatus();
  });
})();
