import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { createHash, randomBytes } from "node:crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const COOKIE_NAME = "via_td";
const DAYS = 30;

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function parseCookie(header: string | null | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function readClientIp(headers: Headers): string | null {
  return (
    headers.get("cf-connecting-ip") ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    null
  );
}

function buildCookie(value: string, maxAgeSeconds: number): string {
  const attrs = [
    `${COOKIE_NAME}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  return attrs.join("; ");
}

/** Verifica se o cookie do device corresponde a algum registro válido do usuário logado. */
export const checkTrustedDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const req = getRequest();
    const token = parseCookie(req.headers.get("cookie"), COOKIE_NAME);
    if (!token) return { trusted: false as const };

    const hash = hashToken(token);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("trusted_devices")
      .select("id, expires_at")
      .eq("user_id", context.userId)
      .eq("token_hash", hash)
      .maybeSingle();

    if (error || !data) return { trusted: false as const };
    if (new Date(data.expires_at).getTime() < Date.now()) {
      await supabaseAdmin.from("trusted_devices").delete().eq("id", data.id);
      return { trusted: false as const };
    }

    await supabaseAdmin
      .from("trusted_devices")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", data.id);

    return { trusted: true as const };
  });

/** Registra o device atual como confiável após MFA bem-sucedido. */
export const registerTrustedDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { label?: string }) => data)
  .handler(async ({ data, context }) => {
    const req = getRequest();
    const ua = req.headers.get("user-agent");
    const ip = readClientIp(req.headers);

    const raw = randomBytes(32).toString("base64url");
    const hash = hashToken(raw);
    const expiresAt = new Date(Date.now() + DAYS * 24 * 60 * 60 * 1000);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("trusted_devices").insert({
      user_id: context.userId,
      token_hash: hash,
      user_agent: ua?.slice(0, 500) ?? null,
      ip_address: ip,
      label: data.label?.slice(0, 100) ?? null,
      expires_at: expiresAt.toISOString(),
    });
    if (error) throw new Error(error.message);

    setResponseHeader("Set-Cookie", buildCookie(raw, DAYS * 24 * 60 * 60));
    return { ok: true as const, expiresAt: expiresAt.toISOString() };
  });

/** Lista devices confiáveis do usuário atual. */
export const listTrustedDevices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const req = getRequest();
    const currentToken = parseCookie(req.headers.get("cookie"), COOKIE_NAME);
    const currentHash = currentToken ? hashToken(currentToken) : null;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("trusted_devices")
      .select("id, user_agent, ip_address, label, last_used_at, expires_at, created_at, token_hash")
      .eq("user_id", context.userId)
      .order("last_used_at", { ascending: false });
    if (error) throw new Error(error.message);

    return (data ?? []).map((d) => ({
      id: d.id,
      user_agent: d.user_agent,
      ip_address: d.ip_address,
      label: d.label,
      last_used_at: d.last_used_at,
      expires_at: d.expires_at,
      created_at: d.created_at,
      is_current: currentHash !== null && d.token_hash === currentHash,
    }));
  });

/** Revoga um device específico do usuário atual. */
export const revokeTrustedDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("trusted_devices")
      .delete()
      .eq("user_id", context.userId)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Revoga TODOS os devices exceto o atual (opcional). */
export const revokeAllOtherTrustedDevices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const req = getRequest();
    const currentToken = parseCookie(req.headers.get("cookie"), COOKIE_NAME);
    const currentHash = currentToken ? hashToken(currentToken) : null;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin.from("trusted_devices").delete().eq("user_id", context.userId);
    if (currentHash) q = q.neq("token_hash", currentHash);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
