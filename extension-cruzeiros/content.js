/* VIA AIR — Exportar Cruzeiro: extrator do portal da operadora.
 *
 * Combina o DOM renderizado com os JSON capturados pelo page-hook.
 * Nunca clica em nada destrutivo: só lê, abre abas/modais informativos
 * quando solicitado e coleta o conteúdo. */
(function () {
  const money = (t) => {
    if (t === null || t === undefined) return null;
    const m = String(t).match(/(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{2}))?/);
    if (!m) return null;
    const n = Number(`${m[1].replace(/\./g, "")}.${m[2] || "00"}`);
    return Number.isFinite(n) ? n : null;
  };
  const txt = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");
  const abs = (u) => {
    if (!u) return "";
    try {
      return new URL(u, location.href).href;
    } catch (_) {
      return "";
    }
  };

  function cabinType(name) {
    const n = (name || "").toLowerCase();
    if (/su[ií]te|yacht club/.test(n)) return "suite";
    if (/varanda|balcony/.test(n)) return "varanda";
    if (/externa|ocean|vista mar/.test(n)) return "externa";
    if (/interna|inside/.test(n)) return "interna";
    return "outro";
  }

  function collectXhr() {
    return new Promise((resolve) => {
      const onMsg = (ev) => {
        if (ev.source !== window || !ev.data || ev.data.__viaairCruise !== "collected") return;
        window.removeEventListener("message", onMsg);
        resolve(ev.data.xhr || []);
      };
      window.addEventListener("message", onMsg);
      window.postMessage({ __viaairCruise: "collect" }, "*");
      setTimeout(() => {
        window.removeEventListener("message", onMsg);
        resolve([]);
      }, 800);
    });
  }

  /* ---------- detecção do tipo de página ---------- */
  function detectar() {
    const body = document.body ? document.body.innerText.toLowerCase() : "";
    const found = [];
    if (/checkout|resumo da reserva|total a pagar|forma de pagamento/.test(body)) found.push("Checkout");
    if (/cabine|interna|varanda|su[ií]te/.test(body)) found.push("Cabines");
    if (/r\$\s?\d/.test(body)) found.push("Preços");
    if (/itiner[áa]rio|roteiro|dia \d+/.test(body)) found.push("Itinerário");
    if (/atra[çc][õo]es|restaurantes|piscinas|entretenimento/.test(body)) found.push("Atrações");
    if (/deck plan|planta dos decks|deck \d+/.test(body)) found.push("Deck Plan");
    if (/ficha t[ée]cnica|tonelagem|tripulantes/.test(body)) found.push("Ficha técnica");
    if (/adicionais|transfer/.test(body)) found.push("Adicionais");
    if (/seguro/.test(body)) found.push("Seguro");
    if (document.querySelector("video, iframe[src*='youtube'], iframe[src*='vimeo']")) found.push("Vídeos");
    if (document.images && document.images.length > 8) found.push("Fotos");
    return found.length ? found : ["Conteúdo genérico"];
  }

  /* ---------- extratores DOM (heurísticos, tolerantes) ---------- */
  function extrairOcupacao() {
    const t = document.body ? document.body.innerText : "";
    const adults = Number((t.match(/(\d+)\s*adult/i) || [])[1] || 0);
    const children = Number((t.match(/(\d+)\s*crian/i) || [])[1] || 0);
    const young = Number((t.match(/(\d+)\s*jovem|jovens/i) || [])[1] || 0);
    const infants = Number((t.match(/(\d+)\s*beb[êe]/i) || [])[1] || 0);
    const ages = [...t.matchAll(/(\d{1,2})\s*anos?/gi)].map((m) => Number(m[1])).filter((n) => n <= 25);
    return { adults, young, children, infants, children_ages: ages.slice(0, children) };
  }

  function extrairCruzeiro() {
    const t = document.body ? document.body.innerText : "";
    const h1 = txt(document.querySelector("h1")) || document.title;
    const nights = Number((t.match(/(\d+)\s*noites?/i) || [])[1] || 0) || null;
    const dep = (t.match(/(\d{2}\/\d{2}\/\d{4})/) || [])[1] || "";
    const navio = (t.match(/\b(MSC|Costa|Norwegian|Royal Caribbean|Disney)\s+[A-ZÁ-Ú][\wÁ-ú]+/) || [])[0] || "";
    return {
      name: h1,
      ship_name: navio,
      departure_date: dep,
      nights,
      currency: "BRL",
    };
  }

  function extrairCabines(occ) {
    const offers = [];
    const seen = new Set();
    const cards = document.querySelectorAll(
      "[class*='cabin'],[class*='cabine'],[class*='categoria'],[data-cabin],[class*='card']",
    );
    cards.forEach((card) => {
      const nome = txt(card.querySelector("h2,h3,h4,strong,[class*='title'],[class*='nome']"));
      if (!nome || nome.length > 90) return;
      if (!/interna|externa|varanda|su[ií]te|yacht/i.test(nome)) return;
      const bloco = txt(card);
      const total = money((bloco.match(/R\$\s?[\d.]+,\d{2}/g) || []).slice(-1)[0]);
      const taxas = money((bloco.match(/taxas?[^R]*R\$\s?[\d.]+,\d{2}/i) || [])[0]);
      const codes = [...bloco.matchAll(/\b(\d{3})\b/g)].map((m) => m[1]).slice(0, 8);
      const img = card.querySelector("img");
      const key = `${nome}`.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      offers.push({
        cabin_type: cabinType(nome),
        name: nome,
        fare_name: "",
        category_codes: [...new Set(codes)],
        image_url: img ? abs(img.getAttribute("src")) : "",
        amenities: [...card.querySelectorAll("li")].map((li) => txt(li)).filter(Boolean).slice(0, 20),
        availability: "",
        price: total
          ? {
              base_amount: taxas && total ? total - taxas : null,
              taxes: taxas,
              total,
              currency: "BRL",
              installments: {},
              passenger_prices: [],
              occupancy: occ,
            }
          : undefined,
      });
    });
    return offers;
  }

  function extrairItinerario() {
    const dias = [];
    const nodes = document.querySelectorAll("[class*='itiner'] li, [class*='itiner'] tr, [class*='roteiro'] li");
    nodes.forEach((n, i) => {
      const t = txt(n);
      if (!t) return;
      const dia = Number((t.match(/dia\s*(\d+)/i) || [])[1] || i + 1);
      const horas = t.match(/(\d{2}:\d{2})/g) || [];
      const porto = t
        .replace(/dia\s*\d+/i, "")
        .replace(/\d{2}\/\d{2}\/\d{4}/g, "")
        .replace(/\d{2}:\d{2}/g, "")
        .replace(/\s{2,}/g, " ")
        .trim()
        .slice(0, 80);
      dias.push({
        day: dia,
        date: (t.match(/\d{2}\/\d{2}\/\d{4}/) || [])[0] || "",
        port: porto,
        country: "",
        arrival: horas[0] || "",
        departure: horas[1] || "",
        description: "",
        image_url: "",
        map_image_url: "",
        activities: [],
      });
    });
    const unico = new Map();
    dias.forEach((d) => unico.set(d.day, d));
    return [...unico.values()].sort((a, b) => a.day - b.day);
  }

  function extrairAtracoes() {
    const out = [];
    document
      .querySelectorAll("[class*='atrac'] [class*='card'], [class*='attraction'], [class*='restaurante']")
      .forEach((el) => {
        const nome = txt(el.querySelector("h3,h4,strong,[class*='title']")) || txt(el).slice(0, 60);
        if (!nome) return;
        const img = el.querySelector("img");
        out.push({
          category: /restaurante|bar/i.test(txt(el))
            ? "restaurantes"
            : /piscina/i.test(txt(el))
              ? "piscinas"
              : /crian/i.test(txt(el))
                ? "criancas"
                : "outros",
          name: nome,
          description: txt(el.querySelector("p")) || "",
          deck: (txt(el).match(/deck\s*(\d+)/i) || [])[1] || "",
          images: img ? [abs(img.getAttribute("src"))] : [],
        });
      });
    return out;
  }

  function extrairDecks() {
    const out = [];
    document.querySelectorAll("img").forEach((img) => {
      const src = abs(img.getAttribute("src"));
      const alt = img.getAttribute("alt") || "";
      if (!/deck/i.test(src + alt)) return;
      const num = Number((`${alt} ${src}`.match(/deck[^0-9]{0,4}(\d{1,2})/i) || [])[1] || 0) || null;
      out.push({
        deck_label: num ? `Deck ${num}` : alt || src.slice(-40),
        deck_number: num,
        image_url: src,
        source_url: location.href,
      });
    });
    return out;
  }

  function extrairMidia() {
    const out = [];
    document.querySelectorAll("img").forEach((img) => {
      const src = abs(img.getAttribute("src"));
      if (!src || /^data:/.test(src)) return;
      if ((img.naturalWidth || img.width || 0) < 120) return;
      out.push({
        media_type: "image",
        context: "gallery",
        source_url: src,
        hires_url: abs(img.getAttribute("data-zoom") || img.getAttribute("data-large") || ""),
        thumbnail_url: "",
        embed_url: "",
        provider: "",
        title: img.getAttribute("title") || "",
        alt: img.getAttribute("alt") || "",
        scope: "ship",
      });
    });
    document.querySelectorAll("iframe[src], video source[src], video[src]").forEach((v) => {
      const src = abs(v.getAttribute("src"));
      if (!src) return;
      if (v.tagName === "IFRAME" && !/youtube|vimeo|player/i.test(src)) return;
      out.push({
        media_type: "video",
        context: "video",
        source_url: src,
        embed_url: src,
        provider: /youtube/i.test(src) ? "youtube" : /vimeo/i.test(src) ? "vimeo" : "html5",
        title: v.getAttribute("title") || "",
        alt: "",
        hires_url: "",
        thumbnail_url: "",
        scope: "ship",
      });
    });
    const uniq = new Map();
    out.forEach((m) => uniq.set(m.source_url, m));
    return [...uniq.values()].slice(0, 400);
  }

  function extrairFichaTecnica() {
    const specs = {};
    document.querySelectorAll("li, tr, [class*='ficha'] div").forEach((el) => {
      const t = txt(el);
      const m = t.match(
        /^(tamanho|inaugura[çc][ãa]o|[úu]ltima reforma|decks?|passageiros|cabines|tripulantes|altura|comprimento|tonelagem)[:\s]+(.{1,60})$/i,
      );
      if (m) specs[m[1].toLowerCase()] = m[2].trim();
    });
    return specs;
  }

  function extrairAdicionais() {
    const out = [];
    document.querySelectorAll("[class*='adicional'], [class*='additional'], [class*='transfer']").forEach((el) => {
      const nome = txt(el.querySelector("h3,h4,strong,[class*='title']")) || txt(el).slice(0, 80);
      if (!nome) return;
      const bloco = txt(el);
      const code = (bloco.match(/\b[0-9A-Z]{6,}\b/) || [])[0] || "";
      const valor = money((bloco.match(/R\$\s?[\d.]+,\d{2}/) || [])[0]);
      out.push({
        category: /transfer/i.test(bloco) ? "Transfers" : "Outros",
        code,
        name: nome,
        description: "",
        prices: valor ? { adult: valor, young: valor, child: valor } : {},
      });
    });
    const uniq = new Map();
    out.forEach((a) => uniq.set(`${a.code}|${a.name}`, a));
    return [...uniq.values()];
  }

  function extrairSeguros() {
    const out = [];
    document.querySelectorAll("[class*='seguro'], [class*='insurance']").forEach((el) => {
      const bloco = txt(el);
      if (!/seguro/i.test(bloco)) return;
      const nome = (bloco.match(/SEGURO[^R]{0,80}/i) || [bloco.slice(0, 60)])[0].trim();
      const link = el.querySelector("a[href]");
      out.push({
        name: nome,
        price_per_person: money((bloco.match(/R\$\s?[\d.]+,\d{2}/) || [])[0]),
        coverage_url: link ? abs(link.getAttribute("href")) : "",
      });
    });
    const uniq = new Map();
    out.forEach((s) => uniq.set(s.name, s));
    return [...uniq.values()].slice(0, 10);
  }

  async function montarPayload() {
    const xhr = await collectXhr();
    const occ = extrairOcupacao();
    const cruise = extrairCruzeiro();
    const specs = extrairFichaTecnica();

    const data = {
      cruise,
      occupancy: occ,
      ship: {
        name: cruise.ship_name,
        line: (cruise.ship_name || "").split(" ")[0] || "",
        description: "",
        main_image_url: "",
        technical_image_url: "",
        specs,
      },
      itinerary: extrairItinerario(),
      cabin_offers: extrairCabines(occ),
      ship_cabins: [],
      attractions: extrairAtracoes(),
      decks: extrairDecks(),
      media: extrairMidia(),
      additionals: extrairAdicionais(),
      insurances: extrairSeguros(),
    };

    return {
      source: "FRT_KROOZE",
      url: location.href,
      page_type: detectar()[0],
      detected: detectar(),
      captured_at: new Date().toISOString(),
      data,
      raw: {
        title: document.title,
        text: (document.body ? document.body.innerText : "").slice(0, 200000),
        html: document.documentElement.outerHTML.slice(0, 900000),
        xhr: xhr.map((x) => ({ url: x.url, status: x.status, body: x.body })),
      },
    };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg) return;
    if (msg.type === "viaair-cruise-detect") {
      sendResponse({ detected: detectar(), url: location.href, title: document.title });
      return false;
    }
    if (msg.type === "viaair-cruise-capture") {
      montarPayload()
        .then((payload) => sendResponse({ ok: true, payload }))
        .catch((e) => sendResponse({ ok: false, error: String(e && e.message ? e.message : e) }));
      return true;
    }
  });
})();
