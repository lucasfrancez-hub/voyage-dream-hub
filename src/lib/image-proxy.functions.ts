import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// Bloqueia alvos internos (SSRF): loopback, redes privadas, link-local, etc.
const BLOCKED_HOST_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /\.local$/i,
  /\.internal$/i,
  /^\[?::1\]?$/,
  /^\[?f[cd][0-9a-f]{2}:/i, // fc00::/7 (ULA)
  /^\[?fe80:/i, // link-local
  /^0\./,
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // CGNAT
  /^metadata(\.|$)/i,
];

function isSafeTarget(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  const host = u.hostname.toLowerCase();
  if (!host) return false;
  if (BLOCKED_HOST_PATTERNS.some((re) => re.test(host))) return false;
  // hostname sem ponto (ex.: "router", "db") = provável nome interno
  if (!host.includes(".")) return false;
  return true;
}

// Busca uma imagem remota no servidor (contorna CORS do browser) e devolve
// base64 + content-type para o cliente embutir no PDF/arte.
// Requer usuário autenticado e bloqueia destinos internos (SSRF).
export const fetchProxiedImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ url: z.string().url().max(2048) }).parse(data))
  .handler(async ({ data }) => {
    if (!isSafeTarget(data.url)) {
      return { ok: false as const, status: 400, error: "URL não permitida" };
    }
    try {
      const r = await fetch(data.url, {
        redirect: "follow",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; ViaAirVoucher/1.0; +https://viaair.tur.br)",
          Accept: "image/*,*/*;q=0.8",
        },
      });
      // Se houve redirecionamento, valida o destino final também
      if (r.url && !isSafeTarget(r.url)) {
        return { ok: false as const, status: 400, error: "Redirecionamento não permitido" };
      }
      if (!r.ok) return { ok: false as const, status: r.status };
      const contentType = (r.headers.get("content-type") ?? "").toLowerCase();
      const buf = new Uint8Array(await r.arrayBuffer());
      if (buf.length > 15 * 1024 * 1024) {
        return { ok: false as const, status: 413, error: "Imagem muito grande" };
      }
      // base64 encode
      let binary = "";
      const chunk = 0x8000;
      for (let i = 0; i < buf.length; i += chunk) {
        binary += String.fromCharCode(...buf.subarray(i, i + chunk));
      }
      const base64 = btoa(binary);
      return { ok: true as const, base64, contentType };
    } catch (e) {
      return {
        ok: false as const,
        status: 0,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  });
