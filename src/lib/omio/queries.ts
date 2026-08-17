/**
 * URLs e snippets de página usados pelo conector Omio.
 *
 * A Omio fica atrás de Cloudflare: chamadas diretas de servidor voltam 403.
 * Por isso tudo aqui é executado DENTRO da página (via CDP Runtime.evaluate),
 * onde os cookies/JS challenge já estão resolvidos.
 */

export const OMIO_BASE = "https://www.omio.com";

export function suggesterUrl(term: string, locale = "en") {
  return `${OMIO_BASE}/suggester-api/v5/position?term=${encodeURIComponent(
    term,
  )}&locale=${locale}&hierarchical=true`;
}

export function resultsApiUrl(searchId: string, direction: "outbound" | "inbound" = "outbound") {
  return `${OMIO_BASE}/bff-core-service/search-experience/results/v2?search_id=${encodeURIComponent(
    searchId,
  )}&direction=${direction}`;
}

export function resultsPageUrl(searchId: string, mode = "train", locale = "en") {
  return `${OMIO_BASE}/app/search-frontend/results/${searchId}/${mode}?locale=${locale}&origin_domain=com`;
}

export function journeyPageUrl(
  mode: string,
  journeyId: string,
  searchId: string,
  legId: string,
  locale = "en",
) {
  return `${OMIO_BASE}/app/search-frontend/journey/${mode}/${journeyId}/${searchId}/${legId}?locale=${locale}&origin_domain=com`;
}

/** JS injetado na página: faz fetch same-origin e devolve JSON serializado. */
export function pageFetchScript(url: string) {
  return `(async () => {
    try {
      const r = await fetch(${JSON.stringify(url)}, {
        credentials: "include",
        headers: { accept: "application/json" },
      });
      const text = await r.text();
      return JSON.stringify({ ok: r.ok, status: r.status, body: text.slice(0, 900000) });
    } catch (e) {
      return JSON.stringify({ ok: false, status: 0, error: String(e) });
    }
  })()`;
}

/**
 * O aviso de cookies da Omio (Usercentrics) vive dentro de um shadow DOM e
 * bloqueia todos os cliques. Este script percorre os shadow roots e aceita.
 */
export const acceptConsentScript = `(() => {
  try {
    const clickIn = (root, depth) => {
      if (depth > 6 || !root) return false;
      for (const el of root.querySelectorAll("*")) {
        if (/^(button|a)$/i.test(el.tagName) && /accept all|aceitar tudo|allow all/i.test(el.textContent || "")) {
          el.click();
          return true;
        }
        if (el.shadowRoot && clickIn(el.shadowRoot, depth + 1)) return true;
      }
      return false;
    };
    return clickIn(document, 0) ? "aceito" : "nenhum";
  } catch (e) {
    return "erro:" + String(e);
  }
})()`;

/**
 * Preenche o formulário REAL da home (que já carrega user_id, abTestParameters,
 * srpQueryParams etc.) e o envia. Formulários sintéticos são rejeitados.
 */
export function submitRealFormScript(params: {
  departureFk: string;
  arrivalFk: string;
  departureDate: string; // dd/mm/yyyy
  passengerAges: number[];
  currency: string;
  locale: string;
  travelMode: string;
}) {
  return `(() => {
    const p = ${JSON.stringify(params)};
    const dep = document.querySelector('input[name=departure_fk]');
    if (!dep || !dep.form) return "sem-form";
    const form = dep.form;
    const set = (name, value) => {
      let el = form.querySelector('[name="' + name + '"]');
      if (!el) {
        el = document.createElement("input");
        el.type = "hidden";
        el.name = name;
        form.appendChild(el);
      }
      el.value = String(value);
    };
    set("departure_fk", p.departureFk);
    set("arrival_fk", p.arrivalFk);
    set("departure_date", p.departureDate);
    set("travel_mode", p.travelMode);
    set("user_currency", p.currency);
    set("user_locale", p.locale);
    p.passengerAges.forEach((age, i) => set("passengerages[" + i + "]", age));
    form.submit();
    return "submetido";
  })()`;
}

/**
 * JS injetado na home: preenche o formulário real de disparo de busca
 * (POST via submit nativo — fetch é bloqueado com 503) e o envia.
 */

export function submitSearchScript(params: {
  departureFk: string;
  arrivalFk: string;
  departureDate: string; // dd/mm/yyyy
  passengerAges: number[];
  currency: string;
  locale: string;
  travelMode: string;
}) {
  return `(() => {
    const p = ${JSON.stringify(params)};
    const form = document.createElement("form");
    form.method = "POST";
    form.action = "/growth/search-trigger/search";
    form.style.display = "none";
    const add = (k, v) => {
      const i = document.createElement("input");
      i.type = "hidden"; i.name = k; i.value = String(v);
      form.appendChild(i);
    };
    add("departure_fk", p.departureFk);
    add("arrival_fk", p.arrivalFk);
    add("departure_date", p.departureDate);
    add("travel_mode", p.travelMode);
    add("user_currency", p.currency);
    add("user_locale", p.locale);
    p.passengerAges.forEach((age, i) => add("passengerages[" + i + "]", age));
    document.body.appendChild(form);
    form.submit();
    return "submitted";
  })()`;
}

/** Mesma busca, mas por GET — usada como plano B quando o POST não redireciona. */
export function searchTriggerGetUrl(params: {
  departureFk: string;
  arrivalFk: string;
  departureDate: string; // dd/mm/yyyy
  passengerAges: number[];
  currency: string;
  locale: string;
  travelMode: string;
}) {
  const q = new URLSearchParams({
    departure_fk: params.departureFk,
    arrival_fk: params.arrivalFk,
    departure_date: params.departureDate,
    travel_mode: params.travelMode,
    user_currency: params.currency,
    user_locale: params.locale,
  });
  params.passengerAges.forEach((age, i) => q.append(`passengerages[${i}]`, String(age)));
  return `${OMIO_BASE}/growth/search-trigger/search?${q.toString()}`;
}

/** Deep link público de resultados (plano C). */
export function deepLinkResultsUrl(params: {
  departureFk: string;
  arrivalFk: string;
  departureDate: string; // dd/mm/yyyy
  travelMode: string;
  locale: string;
}) {
  const q = new URLSearchParams({
    departurePosition: params.departureFk,
    arrivalPosition: params.arrivalFk,
    departureDate: params.departureDate,
    locale: params.locale,
    searchMode: params.travelMode,
  });
  return `${OMIO_BASE}/search-frontend/results?${q.toString()}`;
}

/**
 * Lê o estado atual da aba: URL, searchId (em qualquer formato conhecido),
 * título e se estamos numa tela de desafio do Cloudflare.
 */
export const readSearchIdScript = `(() => {
  try {
    const href = location.href;
    let searchId = null;
    const fromPath = location.pathname.match(/\\/(?:results|journey)\\/(?:[^/]+\\/)?([A-Za-z0-9_-]{6,})/);
    if (fromPath) searchId = fromPath[1];
    if (!searchId) {
      const q = new URLSearchParams(location.search);
      searchId = q.get("search_id") || q.get("searchId") || null;
    }
    if (!searchId) {
      const m = document.documentElement.innerHTML.match(/"search_?[Ii]d"\\s*:\\s*"([A-Za-z0-9_-]{6,})"/);
      if (m) searchId = m[1];
    }
    if (!searchId) {
      const resources = performance.getEntriesByType("resource").map((entry) => entry.name).join("\\n");
      const m = resources.match(/[?&]search_(?:id|Id)=([A-Za-z0-9_-]{6,})/i)
        || resources.match(/\\/results\\/([A-Za-z0-9_-]{6,})/i);
      if (m) searchId = decodeURIComponent(m[1]);
    }
    if (!searchId) {
      const stored = [];
      for (const storage of [localStorage, sessionStorage]) {
        for (let i = 0; i < storage.length; i++) {
          const key = storage.key(i);
          if (key && /search/i.test(key)) stored.push(key + ":" + (storage.getItem(key) || ""));
        }
      }
      const m = stored.join("\\n").match(/search_?[Ii]d[^A-Za-z0-9_-]+([A-Za-z0-9_-]{6,})/i);
      if (m) searchId = m[1];
    }
    const title = document.title || "";
    const body = (document.body && document.body.innerText ? document.body.innerText : "").slice(0, 400);
    const challenge = /just a moment|checking your browser|attention required|cf-browser-verification/i.test(
      title + " " + body,
    );
    return JSON.stringify({ url: href, searchId: searchId, title: title, challenge: challenge, preview: body });
  } catch (e) {
    return JSON.stringify({ url: "", searchId: null, title: "", challenge: false, preview: String(e) });
  }
})()`;

