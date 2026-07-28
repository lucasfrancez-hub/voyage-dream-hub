/* Via Air — Importador de Catálogo (Infotravel)
 *
 * Roda dentro do portal da operadora usando a sessão que o usuário já abriu.
 * Estratégia híbrida:
 *   1) MODO RÁPIDO — intercepta as chamadas fetch/XHR que o próprio portal faz
 *      e reaproveita os JSON de listagem/detalhe (muito mais rápido).
 *   2) MODO DOM — se a listagem não trouxer tudo, navega/pagina/abre detalhes.
 *
 * Nunca guarda senha; usa apenas a sessão autenticada. Não burla MFA/CAPTCHA.
 */
(function () {
  if (window.__viaairCatalogLoaded) return;
  window.__viaairCatalogLoaded = true;

  const STORAGE_KEY = "viaair::catalog";
  const CKPT_KEY = "viaair::catalog::ckpt";
  const SNIFF_KEY = "viaair::catalog::sniff";

  let job = null;          // { token, apiBase, config }
  let control = "idle";    // idle | running | paused | cancelled
  let panel = null;
  const capturedJson = []; // { url, method, body }
  const seenCodes = new Set();

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ---------------------------------------------------------------- sniffer */
  function injectSniffer() {
    const code = `(() => {
      if (window.__viaairSniff) return; window.__viaairSniff = true;
      const post = (url, method, text) => {
        try {
          if (!text || text.length > 2000000) return;
          const t = text.trim();
          if (t[0] !== '{' && t[0] !== '[') return;
          window.postMessage({ __viaairSniff: true, url: String(url), method, body: t }, '*');
        } catch (e) {}
      };
      const of = window.fetch;
      window.fetch = async function (...a) {
        const res = await of.apply(this, a);
        try { res.clone().text().then((t) => post((a[0] && a[0].url) || a[0], (a[1] && a[1].method) || 'GET', t)); } catch (e) {}
        return res;
      };
      const open = XMLHttpRequest.prototype.open;
      const send = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function (m, u) { this.__vm = m; this.__vu = u; return open.apply(this, arguments); };
      XMLHttpRequest.prototype.send = function () {
        this.addEventListener('load', () => { try { post(this.__vu, this.__vm, this.responseText); } catch (e) {} });
        return send.apply(this, arguments);
      };
    })();`;
    const s = document.createElement("script");
    s.textContent = code;
    (document.head || document.documentElement).appendChild(s);
    s.remove();
  }

  window.addEventListener("message", (ev) => {
    if (ev.source !== window || !ev.data || ev.data.__viaairSniff !== true) return;
    let parsed;
    try { parsed = JSON.parse(ev.data.body); } catch { return; }
    capturedJson.push({ url: ev.data.url, method: ev.data.method, data: parsed, at: Date.now() });
    if (capturedJson.length > 60) capturedJson.shift();
    try { chrome.storage.local.set({ [SNIFF_KEY]: capturedJson.slice(-15).map((c) => c.url) }); } catch { /* noop */ }
  });

  /* ------------------------------------------------------- extração de dados */
  const PRODUCT_HINTS = ["nome", "name", "titulo", "title", "descricao", "description", "servico", "produto"];

  function looksLikeProductArray(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return false;
    const first = arr[0];
    if (!first || typeof first !== "object") return false;
    const keys = Object.keys(first).map((k) => k.toLowerCase());
    return PRODUCT_HINTS.some((h) => keys.some((k) => k.includes(h)));
  }

  function findProductArrays(node, out, depth) {
    if (depth > 6 || !node || typeof node !== "object") return out;
    if (looksLikeProductArray(node)) { out.push(node); return out; }
    for (const v of Array.isArray(node) ? node : Object.values(node)) {
      if (v && typeof v === "object") findProductArrays(v, out, depth + 1);
    }
    return out;
  }

  const pick = (obj, ...names) => {
    const keys = Object.keys(obj || {});
    for (const n of names) {
      const k = keys.find((k) => k.toLowerCase().replace(/[_\s]/g, "") === n);
      if (k != null && obj[k] != null && obj[k] !== "") return obj[k];
    }
    for (const n of names) {
      const k = keys.find((k) => k.toLowerCase().includes(n));
      if (k != null && obj[k] != null && obj[k] !== "") return obj[k];
    }
    return undefined;
  };

  const str = (v) => (v == null ? undefined : String(v).trim().slice(0, 8000) || undefined);
  const num = (v) => {
    if (v == null) return undefined;
    const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.,-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : undefined;
  };
  const list = (v) => {
    if (Array.isArray(v)) return v.map((x) => (typeof x === "string" ? x : (pick(x, "descricao", "description", "nome", "name") ?? ""))).map(String).filter(Boolean).slice(0, 100);
    if (typeof v === "string" && v.trim()) return v.split(/\n|•|;/).map((s) => s.trim()).filter(Boolean).slice(0, 100);
    return undefined;
  };

  function mapProduct(raw, period) {
    const code =
      str(pick(raw, "codigoexterno", "externalcode", "codigo", "code", "id", "productid", "servicoid")) ||
      ("hash_" + hash(JSON.stringify(raw).slice(0, 2000)));
    const name = str(pick(raw, "nome", "name", "titulo", "title", "descricaocurta"));
    if (!name) return null;
    const images = []
      .concat(pick(raw, "imagens", "images", "fotos", "photos", "galeria") || [])
      .map((i) => (typeof i === "string" ? i : pick(i, "url", "src", "link")))
      .filter((u) => typeof u === "string" && /^https?:\/\//i.test(u))
      .slice(0, 60);
    const single = pick(raw, "imagem", "image", "foto", "thumb");
    if (typeof single === "string" && /^https?:\/\//i.test(single)) images.unshift(single);

    return {
      external_code: String(code).slice(0, 200),
      internal_code: str(pick(raw, "codigointerno", "internalcode")),
      name: name.slice(0, 500),
      subtitle: str(pick(raw, "subtitulo", "subtitle")),
      description: str(pick(raw, "descricaocompleta", "descricao", "description", "detalhes")),
      summary: str(pick(raw, "resumo", "summary")),
      highlights: list(pick(raw, "destaques", "highlights")),
      service_type: str(pick(raw, "tiposervico", "servicetype", "tipo", "type")),
      category: str(pick(raw, "categoria", "category")),
      subcategory: str(pick(raw, "subcategoria", "subcategory")),
      duration: str(pick(raw, "duracao", "duration")),
      language: str(pick(raw, "idioma", "language")),
      schedules: list(pick(raw, "horarios", "schedules", "horario")),
      available_days: list(pick(raw, "diasdisponiveis", "dias", "days")),
      departure_place: str(pick(raw, "localsaida", "saida", "departure", "pickup")),
      return_place: str(pick(raw, "localretorno", "retorno", "return", "dropoff")),
      meeting_point: str(pick(raw, "pontoencontro", "meetingpoint", "encontro")),
      cancellation_policy: str(pick(raw, "politicacancelamento", "cancelamento", "cancellation")),
      change_policy: str(pick(raw, "politicaalteracao", "alteracao", "change")),
      important_info: str(pick(raw, "informacoesimportantes", "importante", "importantinfo", "observacoesimportantes")),
      notes: str(pick(raw, "observacoes", "notes", "obs")),
      requirements: str(pick(raw, "requisitos", "requirements")),
      includes: list(pick(raw, "inclui", "includes", "incluso")),
      not_includes: list(pick(raw, "naoinclui", "notincludes", "naoincluso")),
      supplier: str(pick(raw, "fornecedor", "supplier", "operadora", "operator")),
      currency: str(pick(raw, "moeda", "currency")) || "BRL",
      price: num(pick(raw, "valor", "preco", "price", "amount", "total", "tarifa")),
      destination: str(pick(raw, "destino", "destination")),
      city: str(pick(raw, "cidade", "city")),
      state: str(pick(raw, "estado", "state", "uf")),
      country: str(pick(raw, "pais", "country")),
      product_url: str(pick(raw, "url", "link", "producturl")),
      images: images.length ? images : undefined,
      period_start: period && period.start,
      period_end: period && period.end,
      available: true,
      raw,
    };
  }

  function hash(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return Math.abs(h).toString(36);
  }

  /* --------------------------------------------------------- fallback no DOM */
  function domProducts(period) {
    const cards = Array.from(
      document.querySelectorAll("[class*='card'],[class*='servico'],[class*='result'],li,article"),
    ).filter((el) => {
      const t = (el.innerText || "").trim();
      return t.length > 40 && t.length < 4000 && /R\$|\bUS\$|\bvalor|\bde\b/i.test(t) && el.querySelector("img,h1,h2,h3,h4,strong,b");
    });
    const out = [];
    const seen = new Set();
    for (const el of cards.slice(0, 200)) {
      const titleEl = el.querySelector("h1,h2,h3,h4,strong,b,[class*='titulo'],[class*='title']");
      const name = titleEl && titleEl.innerText.trim();
      if (!name || name.length < 4 || seen.has(name)) continue;
      seen.add(name);
      const text = el.innerText.trim();
      const priceM = text.match(/R\$\s*([\d.]+,\d{2})/);
      const link = el.querySelector("a[href]");
      const imgs = Array.from(el.querySelectorAll("img[src]"))
        .map((i) => i.src)
        .filter((u) => /^https?:\/\//i.test(u))
        .slice(0, 10);
      out.push({
        external_code: "dom_" + hash(name),
        name: name.slice(0, 500),
        description: text.slice(0, 8000),
        price: priceM ? Number(priceM[1].replace(/\./g, "").replace(",", ".")) : undefined,
        currency: "BRL",
        product_url: link ? link.href : location.href,
        images: imgs.length ? imgs : undefined,
        period_start: period && period.start,
        period_end: period && period.end,
        available: true,
        raw: { source: "dom" },
      });
    }
    return out;
  }

  /* ------------------------------------------------------------- navegação */
  function findInput(...patterns) {
    const inputs = Array.from(document.querySelectorAll("input,textarea"));
    for (const p of patterns) {
      const re = new RegExp(p, "i");
      const hit = inputs.find((i) => {
        const meta = `${i.placeholder || ""} ${i.name || ""} ${i.id || ""} ${i.getAttribute("aria-label") || ""}`;
        return re.test(meta);
      });
      if (hit) return hit;
    }
    return null;
  }

  function setValue(el, value) {
    if (!el) return false;
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
    return true;
  }

  function clickByText(...texts) {
    const els = Array.from(document.querySelectorAll("button,a,span,div[role='button'],input[type='submit']"));
    for (const t of texts) {
      const re = new RegExp(`^\\s*${t}\\s*$`, "i");
      const hit = els.find((e) => re.test((e.innerText || e.value || "").trim()));
      if (hit) { hit.click(); return true; }
    }
    return false;
  }

  function brDate(iso) {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  }

  async function runSearch(destination, period) {
    clickByText("Serviços", "Servicos");
    await sleep(600);
    const dest = findInput("destino", "cidade|hotel de destino", "destination");
    if (dest && destination) { setValue(dest, destination); await sleep(1200); }
    const ida = findInput("^ida$", "data inicial", "checkin", "check-in");
    const volta = findInput("^volta$", "data final", "checkout", "check-out");
    if (ida) setValue(ida, brDate(period.start));
    if (volta) setValue(volta, brDate(period.end));
    await sleep(400);
    clickByText("Pesquisar", "Buscar", "Procurar");
    await sleep(3500);
  }

  async function nextPage() {
    const before = document.body.innerText.length;
    const ok = clickByText("Próxima", "Proxima", "Próximo", ">", "Carregar mais", "Ver mais");
    if (!ok) return false;
    await sleep(2500);
    return document.body.innerText.length !== before;
  }

  /* ------------------------------------------------------------------ envio */
  async function post(body) {
    const res = await fetch(`${job.apiBase}/api/public/catalog-import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.assign({ token: job.token }, body)),
    });
    const out = await res.json().catch(() => ({}));
    if (out && out.status === "cancelled") control = "cancelled";
    return out;
  }

  /* ------------------------------------------------------------------ ciclo */
  async function start(resume) {
    control = "running";
    const cfg = job.config || {};
    const periods = cfg.periods || [];
    const destination = cfg.destination || "";
    const delay = Number(cfg.delay_ms || 1200);
    let index = resume && resume.index ? resume.index : 0;
    const errors = [];

    for (; index < periods.length; index++) {
      if (control === "cancelled") break;
      while (control === "paused") await sleep(1500);

      const period = periods[index];
      chrome.storage.local.set({ [CKPT_KEY]: { index, token: job.token } });
      setPanel(`Período ${index + 1}/${periods.length} — ${period.start} a ${period.end}`);

      try {
        capturedJson.length = 0;
        await runSearch(destination, period);

        let page = 1;
        let more = true;
        while (more && control === "running") {
          const fromApi = [];
          for (const cap of capturedJson) {
            for (const arr of findProductArrays(cap.data, [], 0)) {
              for (const raw of arr) {
                const mapped = mapProduct(raw, period);
                if (mapped && !seenCodes.has(mapped.external_code)) {
                  seenCodes.add(mapped.external_code);
                  fromApi.push(mapped);
                }
              }
            }
          }
          capturedJson.length = 0;

          let batch = fromApi;
          if (batch.length === 0) {
            batch = domProducts(period).filter((p) => {
              if (seenCodes.has(p.external_code)) return false;
              seenCodes.add(p.external_code);
              return true;
            });
          }

          for (let i = 0; i < batch.length; i += 25) {
            const slice = batch.slice(i, i + 25);
            setPanel(`Período ${index + 1}/${periods.length} · pág ${page} · ${slice[0] ? slice[0].name : ""}`);
            await post({
              action: "ingest",
              products: slice,
              progress: {
                operator: cfg.operator_slug,
                destination,
                period: `${period.start} → ${period.end}`,
                page,
                product: slice[slice.length - 1] ? slice[slice.length - 1].name : "",
                done_periods: index,
                total_periods: periods.length,
              },
              errors: errors.splice(0, errors.length),
            });
            await sleep(delay);
          }

          more = await nextPage();
          page++;
          if (page > 60) more = false;
        }
      } catch (err) {
        errors.push({ message: String((err && err.message) || err), context: { period } });
      }
      await sleep(delay);
    }

    if (control !== "cancelled") {
      await post({
        action: "finish",
        seen_codes: Array.from(seenCodes).slice(0, 5000),
        progress: { done_periods: periods.length, total_periods: periods.length },
        errors,
      });
      setPanel("Importação concluída ✅");
    } else {
      setPanel("Importação cancelada");
    }
    chrome.storage.local.remove(CKPT_KEY);
    control = "idle";
  }

  /* ------------------------------------------------------------------ painel */
  function setPanel(text) {
    if (!panel) {
      panel = document.createElement("div");
      panel.style.cssText =
        "position:fixed;z-index:2147483647;right:16px;bottom:16px;max-width:340px;padding:12px 14px;" +
        "border-radius:12px;background:#0f172a;color:#fff;font:12px/1.5 -apple-system,system-ui,sans-serif;" +
        "box-shadow:0 10px 30px rgba(0,0,0,.35)";
      document.documentElement.appendChild(panel);
    }
    panel.innerHTML =
      '<b style="color:#F26B1F">VIA AIR</b> — Importador de catálogo<br>' +
      String(text).replace(/</g, "&lt;");
  }

  /* -------------------------------------------------------------- disparador */
  function checkJob() {
    chrome.storage.local.get([STORAGE_KEY, CKPT_KEY], (res) => {
      const stored = res[STORAGE_KEY];
      if (!stored || !stored.token || control === "running") return;
      if (stored.consumedAt && Date.now() - stored.consumedAt < 5000) return;
      job = stored;
      chrome.storage.local.set({ [STORAGE_KEY]: Object.assign({}, stored, { consumedAt: Date.now() }) });
      setPanel("Iniciando…");
      start(res[CKPT_KEY]);
    });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[STORAGE_KEY]) checkJob();
    if (changes["viaair::catalog::control"]) {
      const v = changes["viaair::catalog::control"].newValue;
      if (v === "paused" || v === "running" || v === "cancelled") control = v;
    }
  });

  injectSniffer();
  setTimeout(checkJob, 1500);
})();
