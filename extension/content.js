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

  function extractTables(doc) {
    // Preserva estrutura de tabelas (consolidadora renderiza voos e passageiros
    // em <table>). Sem isso o textContent colapsa colunas e o LLM se perde.
    const chunks = [];
    const tables = doc.querySelectorAll("table");
    for (const t of tables) {
      if (!isVisible(t)) continue;
      const rows = [];
      const trs = t.querySelectorAll("tr");
      for (const tr of trs) {
        if (!isVisible(tr)) continue;
        const cells = tr.querySelectorAll("th,td");
        if (!cells.length) continue;
        const line = Array.from(cells)
          .map((c) => (c.innerText || c.textContent || "").replace(/\s+/g, " ").trim())
          .filter(Boolean)
          .join(" | ");
        if (line) rows.push(line);
      }
      if (rows.length) chunks.push("TABELA:\n" + rows.join("\n"));
    }
    return chunks.join("\n\n");
  }

  function isVisible(el) {
    if (!el || el.hidden || el.getAttribute("aria-hidden") === "true") return false;
    const style = el.ownerDocument.defaultView.getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  }

  function extractFromDoc(doc) {
    if (!doc || !doc.body) return "";
    const tablesText = extractTables(doc);
    const formValues = [];
    doc.body.querySelectorAll("input,select,textarea").forEach((el) => {
      if (!isVisible(el)) return;
      const v = el.value || el.getAttribute("value") || "";
      if (v && v.trim()) {
        const label = el.getAttribute("name") || el.getAttribute("id") || "";
        formValues.push(`${label ? label + ": " : ""}${v}`);
      }
    });
    // innerText traz apenas o conteúdo realmente exibido. textContent incluía
    // telas/templates ocultos do portal e cortava a tabela da reserva no limite.
    const bodyText = doc.body.innerText || "";
    return [tablesText, formValues.length ? "CAMPOS:\n" + formValues.join("\n") : "", "TEXTO VISÍVEL:\n" + bodyText]
      .filter(Boolean)
      .join("\n\n");
  }

  function walkFrames(doc, depth, out) {
    if (!doc || depth > 4) return;
    const frames = doc.querySelectorAll("iframe,frame");
    for (const f of frames) {
      try {
        const inner = f.contentDocument || (f.contentWindow && f.contentWindow.document);
        if (!inner) continue;
        const txt = extractFromDoc(inner);
        if (txt && txt.trim().length > 50) {
          out.push("===== FRAME[" + depth + "]: " + (f.src || f.name || "inline") + " =====\n" + txt);
        }
        walkFrames(inner, depth + 1, out);
      } catch (e) { /* cross-origin */ }
    }
  }

  function collectPageText() {
    // Portais ASP.NET (SkyTeam/FRT/Visual/Infotera) renderizam a reserva DENTRO
    // de <iframe> (às vezes aninhados). Percorremos recursivamente todos os
    // frames same-origin e concatenamos com o texto da página principal.
    const frameParts = [];
    walkFrames(document, 0, frameParts);
    // Na consolidadora, a página externa contém menus, filtros e exemplos de
    // pesquisa. A reserva verdadeira está no iframe/modal; enviamos somente ele.
    const parts = isConsolidator && frameParts.length
      ? frameParts
      : [extractFromDoc(document), ...frameParts];
    return parts.join("\n\n")
      .replace(/[ \t\u00a0]+/g, " ")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  // Consolidadoras têm todo o conteúdo estruturado em tabelas no iframe;
  // screenshot só atrapalha (modal com scroll interno, quota do captureVisibleTab).
  const CONSOLIDATORS = new Set(["skyteam", "frt", "visualturismo", "infotera"]);
  const isConsolidator = CONSOLIDATORS.has(airline);


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

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  function captureViewport() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "viaair-capture" }, (resp) => {
        if (!resp || resp.error) resolve(null);
        else resolve(resp.dataUrl);
      });
    });
  }

  function findScrollContainer() {
    // Portais como a consolidadora abrem a reserva num modal com scroll interno
    // (a página em si não rola). Procuramos o maior elemento scrollável visível.
    let best = null;
    let bestArea = 0;
    const els = document.querySelectorAll("*");
    for (const el of els) {
      const sh = el.scrollHeight;
      const ch = el.clientHeight;
      if (sh - ch < 40 || ch < 200) continue;
      const style = getComputedStyle(el);
      const oy = style.overflowY;
      if (oy !== "auto" && oy !== "scroll" && oy !== "overlay") continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 300 || rect.height < 200) continue;
      const area = rect.width * rect.height;
      if (area > bestArea) { bestArea = area; best = el; }
    }
    return best;
  }

  async function captureFullPage() {
    // captureVisibleTab tem quota ~2/s → 600ms entre shots.
    const shots = [];
    const maxShots = 10;
    const container = findScrollContainer();

    const getScroll = () => container ? container.scrollTop : window.scrollY;
    const setScroll = (y) => container
      ? (container.scrollTop = y)
      : window.scrollTo({ top: y, behavior: "instant" });
    const viewH = container ? container.clientHeight : window.innerHeight;
    const totalH = container ? container.scrollHeight : document.documentElement.scrollHeight;
    const step = Math.floor(viewH * 0.85);
    const originalScroll = getScroll();

    setScroll(0);
    await sleep(500);

    for (let i = 0; i < maxShots; i++) {
      const shot = await captureViewport();
      if (shot) shots.push(shot);
      const nextY = getScroll() + step;
      const maxY = totalH - viewH;
      if (getScroll() >= maxY - 5) break;
      setScroll(nextY);
      await sleep(650);
    }
    setScroll(originalScroll);
    return shots;
  }

  async function sendImport(ctx) {
    const rawText = collectPageText();
    if (rawText.length < 200) {
      showToast("Página ainda não carregou os dados da reserva. Aguarde e tente de novo.", "err");
      return;
    }
    showToast(isConsolidator ? "Lendo iframe e enviando pra Via Air…" : "Capturando tela e enviando pra Via Air…");
    try {
      // Consolidadora: SÓ iframe (sem screenshot). Companhia: iframe + screenshot.
      const screenshots = isConsolidator ? [] : await captureFullPage();
      const res = await fetch(ctx.apiBase.replace(/\/+$/, "") + "/api/public/import-aereo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token: ctx.token,
          airline_hint: airline,
          source_url: location.href,
          raw_text: rawText,
          screenshots,
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
    if (!document.body) return;

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
    btn.onclick = async () => {
      const ctx = await loadCtx();
      if (!ctx) {
        showToast("Token não encontrado. Abra o pedido no admin da Via Air e clique em 'Importar aéreo' — depois volte aqui.", "err");
        return;
      }
      sendImport(ctx);
    };
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
