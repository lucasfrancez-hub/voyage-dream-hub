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
