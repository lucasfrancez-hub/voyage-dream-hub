/** Detecção simples de dispositivo/navegador/SO a partir do User-Agent. */
export function parseUserAgent(ua: string | null | undefined) {
  const s = (ua || "").toLowerCase();
  const device = /ipad|tablet/.test(s)
    ? "tablet"
    : /mobi|iphone|android/.test(s)
      ? "mobile"
      : s
        ? "desktop"
        : "desconhecido";

  const browser = /edg\//.test(s)
    ? "Edge"
    : /opr\/|opera/.test(s)
      ? "Opera"
      : /chrome|crios/.test(s)
        ? "Chrome"
        : /firefox|fxios/.test(s)
          ? "Firefox"
          : /safari/.test(s)
            ? "Safari"
            : "Outro";

  const os = /iphone|ipad|ios/.test(s)
    ? "iOS"
    : /android/.test(s)
      ? "Android"
      : /mac os|macintosh/.test(s)
        ? "macOS"
        : /windows/.test(s)
          ? "Windows"
          : /linux/.test(s)
            ? "Linux"
            : "Outro";

  return { device, browser, os };
}

/** Região aproximada a partir dos cabeçalhos da borda (Cloudflare). */
export function geoFromHeaders(h: Headers) {
  return {
    country: h.get("cf-ipcountry") || h.get("x-vercel-ip-country") || null,
    region: h.get("cf-region") || h.get("x-vercel-ip-country-region") || null,
    city: h.get("cf-ipcity") || h.get("x-vercel-ip-city") || null,
  };
}

export function hostDoReferrer(ref: string | null | undefined) {
  if (!ref) return null;
  try {
    return new URL(ref).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Códigos ISO → nomes de países usados no público brasileiro. */
const PAISES: Record<string, string> = {
  BR: "Brasil", PT: "Portugal", US: "Estados Unidos", AR: "Argentina", CL: "Chile",
  UY: "Uruguai", PY: "Paraguai", CO: "Colômbia", PE: "Peru", MX: "México",
  ES: "Espanha", IT: "Itália", FR: "França", DE: "Alemanha", GB: "Reino Unido",
  NL: "Países Baixos", SE: "Suécia", IE: "Irlanda", CA: "Canadá", JP: "Japão",
  AU: "Austrália", CH: "Suíça", BE: "Bélgica", AT: "Áustria", PL: "Polônia",
};

/** UFs brasileiras (código curto → nome). */
const UFS: Record<string, string> = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia", CE: "Ceará",
  DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão",
  MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais", PA: "Pará",
  PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí", RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte", RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima",
  SC: "Santa Catarina", SP: "São Paulo", SE: "Sergipe", TO: "Tocantins",
};

export function nomeDoPais(code?: string | null) {
  if (!code) return null;
  const c = code.trim();
  if (c.length !== 2) return c;
  return PAISES[c.toUpperCase()] ?? c.toUpperCase();
}

export function nomeDaRegiao(valor?: string | null, pais?: string | null) {
  if (!valor) return null;
  const v = valor.trim();
  if (v.length === 2 && (pais ?? "").toUpperCase() === "BR") return UFS[v.toUpperCase()] ?? v;
  return v;
}

/**
 * Geolocalização a partir da borda (Cloudflare `request.cf` ou cabeçalhos).
 * Já devolve nomes legíveis de país e estado.
 */
export function geoFromRequest(request: Request) {
  const h = request.headers;
  const cf = (request as unknown as { cf?: Record<string, unknown> }).cf ?? {};
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

  const countryCode =
    str(cf["country"]) || h.get("cf-ipcountry") || h.get("x-vercel-ip-country") || null;
  const regionRaw =
    str(cf["region"]) ||
    str(cf["regionCode"]) ||
    h.get("cf-region") ||
    h.get("cf-region-code") ||
    h.get("x-vercel-ip-country-region") ||
    null;
  const cityRaw =
    str(cf["city"]) ||
    h.get("cf-ipcity") ||
    h.get("x-vercel-ip-city") ||
    null;

  return {
    country: nomeDoPais(countryCode),
    region: nomeDaRegiao(regionRaw, countryCode),
    city: cityRaw ? decodeURIComponent(cityRaw) : null,
  };
}
