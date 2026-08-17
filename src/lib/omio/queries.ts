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

/** Lê o searchId da URL atual da página de resultados. */
export const readSearchIdScript = `(() => {
  const m = location.pathname.match(/\\/results\\/([A-Za-z0-9]+)/);
  return JSON.stringify({ url: location.href, searchId: m ? m[1] : null });
})()`;
