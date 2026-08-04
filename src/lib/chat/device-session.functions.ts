/**
 * Sessão de aparelho do Chat (PWA): mantém o atendente logado por 30 dias
 * usando um PIN, igual à Agenda. O cookie é httpOnly e o PIN fica guardado
 * apenas como hash (PBKDF2). O desbloqueio gera um link mágico interno e
 * devolve o token para o cliente criar uma sessão nova do Supabase.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const COOKIE = "via_chat_dev";
const DIAS = 30;
const MAX_TENTATIVAS = 5;

function bytesParaHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(valor: string): Promise<string> {
  return bytesParaHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(valor)));
}

async function hashPin(pin: string, saltHex: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, [
    "deriveBits",
  ]);
  const salt = Uint8Array.from(saltHex.match(/.{2}/g)!.map((h) => parseInt(h, 16)));
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 120_000, hash: "SHA-256" },
    key,
    256,
  );
  return `${saltHex}:${bytesParaHex(bits)}`;
}

async function conferePin(pin: string, guardado: string): Promise<boolean> {
  const [saltHex] = guardado.split(":");
  if (!saltHex) return false;
  const calc = await hashPin(pin, saltHex);
  if (calc.length !== guardado.length) return false;
  let dif = 0;
  for (let i = 0; i < calc.length; i++) dif |= calc.charCodeAt(i) ^ guardado.charCodeAt(i);
  return dif === 0;
}

function lerCookie(header: string | null | undefined, nome: string): string | null {
  if (!header) return null;
  for (const parte of header.split(";")) {
    const [k, ...resto] = parte.trim().split("=");
    if (k === nome) return decodeURIComponent(resto.join("="));
  }
  return null;
}

function montarCookie(valor: string, maxAge: number): string {
  return [
    `${COOKIE}=${encodeURIComponent(valor)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ].join("; ");
}

function mascarar(email: string): string {
  const [local, dominio] = email.split("@");
  if (!dominio) return email;
  return `${local.slice(0, 2)}${"•".repeat(Math.max(local.length - 2, 2))}@${dominio}`;
}

/** Registra o aparelho atual com um PIN (usuário já autenticado). */
export const registrarAparelhoChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ pin: z.string().regex(/^\d{4,8}$/), label: z.string().max(80).optional() }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const req = getRequest();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const bruto = bytesParaHex(crypto.getRandomValues(new Uint8Array(32)).buffer);
    const tokenHash = await sha256Hex(bruto);
    const salt = bytesParaHex(crypto.getRandomValues(new Uint8Array(16)).buffer);
    const pinHash = await hashPin(data.pin, salt);
    const expira = new Date(Date.now() + DIAS * 864e5);

    // Remove um eventual registro antigo deste mesmo aparelho.
    const antigo = lerCookie(req.headers.get("cookie"), COOKIE);
    if (antigo) {
      await supabaseAdmin.from("chat_device_sessions").delete().eq("token_hash", await sha256Hex(antigo));
    }

    const { error } = await supabaseAdmin.from("chat_device_sessions").insert({
      user_id: context.userId,
      token_hash: tokenHash,
      pin_hash: pinHash,
      label: data.label?.slice(0, 80) ?? null,
      user_agent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
      expires_at: expira.toISOString(),
    });
    if (error) throw new Error(error.message);

    setResponseHeader("Set-Cookie", montarCookie(bruto, DIAS * 86400));
    return { ok: true as const, expiresAt: expira.toISOString() };
  });

/** Diz se este aparelho tem PIN salvo (rota pública — só lê o cookie). */
export const statusAparelhoChat = createServerFn({ method: "POST" }).handler(async () => {
  const token = lerCookie(getRequest().headers.get("cookie"), COOKIE);
  if (!token) return { registrado: false as const };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("chat_device_sessions")
    .select("id, user_id, expires_at, locked_until")
    .eq("token_hash", await sha256Hex(token))
    .maybeSingle();
  if (!data) return { registrado: false as const };
  if (new Date(data.expires_at).getTime() < Date.now()) {
    await supabaseAdmin.from("chat_device_sessions").delete().eq("id", data.id);
    return { registrado: false as const };
  }

  const { data: u } = await supabaseAdmin.auth.admin.getUserById(data.user_id);
  return {
    registrado: true as const,
    email: u?.user?.email ? mascarar(u.user.email) : null,
    bloqueadoAte: data.locked_until,
  };
});

/** Valida o PIN e devolve um token de sessão para o cliente restaurar o login. */
export const desbloquearAparelhoChat = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => z.object({ pin: z.string().regex(/^\d{4,8}$/) }).parse(raw))
  .handler(async ({ data }) => {
    const token = lerCookie(getRequest().headers.get("cookie"), COOKIE);
    if (!token) throw new Error("Aparelho não registrado.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: reg } = await supabaseAdmin
      .from("chat_device_sessions")
      .select("id, user_id, pin_hash, attempts, locked_until, expires_at")
      .eq("token_hash", await sha256Hex(token))
      .maybeSingle();
    if (!reg) throw new Error("Aparelho não registrado.");
    if (new Date(reg.expires_at).getTime() < Date.now()) {
      await supabaseAdmin.from("chat_device_sessions").delete().eq("id", reg.id);
      throw new Error("Acesso deste aparelho expirou. Entre novamente.");
    }
    if (reg.locked_until && new Date(reg.locked_until).getTime() > Date.now()) {
      throw new Error("Muitas tentativas. Aguarde alguns minutos.");
    }

    if (!(await conferePin(data.pin, reg.pin_hash))) {
      const tentativas = (reg.attempts ?? 0) + 1;
      await supabaseAdmin
        .from("chat_device_sessions")
        .update({
          attempts: tentativas,
          locked_until:
            tentativas >= MAX_TENTATIVAS ? new Date(Date.now() + 10 * 60_000).toISOString() : null,
        })
        .eq("id", reg.id);
      throw new Error("PIN incorreto.");
    }

    const { data: u } = await supabaseAdmin.auth.admin.getUserById(reg.user_id);
    const email = u?.user?.email;
    if (!email) throw new Error("Usuário sem e-mail cadastrado.");

    const { data: link, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkErr || !link?.properties?.hashed_token) {
      throw new Error(linkErr?.message || "Não foi possível restaurar a sessão.");
    }

    await supabaseAdmin
      .from("chat_device_sessions")
      .update({ attempts: 0, locked_until: null, last_used_at: new Date().toISOString() })
      .eq("id", reg.id);

    return { ok: true as const, email, tokenHash: link.properties.hashed_token };
  });

/**
 * Renova a sessão do Supabase silenciosamente (sem PIN) enquanto o aparelho
 * registrado estiver válido. É isso que impede o app de cair antes dos 30 dias
 * e mantém as notificações funcionando.
 */
export const renovarSessaoAparelhoChat = createServerFn({ method: "POST" }).handler(async () => {
  const token = lerCookie(getRequest().headers.get("cookie"), COOKIE);
  if (!token) return { ok: false as const };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: reg } = await supabaseAdmin
    .from("chat_device_sessions")
    .select("id, user_id, expires_at")
    .eq("token_hash", await sha256Hex(token))
    .maybeSingle();
  if (!reg) return { ok: false as const };
  if (new Date(reg.expires_at).getTime() < Date.now()) {
    await supabaseAdmin.from("chat_device_sessions").delete().eq("id", reg.id);
    return { ok: false as const };
  }

  const { data: u } = await supabaseAdmin.auth.admin.getUserById(reg.user_id);
  const email = u?.user?.email;
  if (!email) return { ok: false as const };

  const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (error || !link?.properties?.hashed_token) return { ok: false as const };

  // Janela deslizante: cada uso empurra a validade para mais 30 dias.
  const novoExpira = new Date(Date.now() + DIAS * 864e5).toISOString();
  await supabaseAdmin
    .from("chat_device_sessions")
    .update({ last_used_at: new Date().toISOString(), expires_at: novoExpira })
    .eq("id", reg.id);
  setResponseHeader("Set-Cookie", montarCookie(token, DIAS * 86400));

  return { ok: true as const, email, tokenHash: link.properties.hashed_token };
});

/** Esquece este aparelho (logout definitivo). */
export const esquecerAparelhoChat = createServerFn({ method: "POST" }).handler(async () => {
  const token = lerCookie(getRequest().headers.get("cookie"), COOKIE);
  if (token) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("chat_device_sessions").delete().eq("token_hash", await sha256Hex(token));
  }
  setResponseHeader("Set-Cookie", montarCookie("", 0));
  return { ok: true as const };
});

/* ------------------------------------------------------------------ */
/* Link do app do Chat (igual à Agenda: link secreto + PIN)            */
/* ------------------------------------------------------------------ */

async function hashPinLink(token: string, pin: string): Promise<string> {
  return sha256Hex(`viaair-chat:${token}:${pin}`);
}

/** Lista os links de app criados. */
export const listarLinksChat = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ destino: z.enum(["chat", "admin"]) }).parse(raw))
  .handler(async ({ data: input }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("chat_app_links")
      .select("id, token, nome, ativo, last_seen_at")
      .eq("destino", input.destino)
      .order("created_at", { ascending: true });
    return { links: data ?? [] };
  });

/** Cria um link secreto de app protegido por PIN de 4 números. */
export const criarLinkChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ nome: z.string().max(60).optional(), pin: z.string().regex(/^\d{4}$/), destino: z.enum(["chat", "admin"]) }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const bytes = crypto.getRandomValues(new Uint8Array(18));
    const token = Array.from(bytes)
      .map((b) => "abcdefghijkmnopqrstuvwxyz23456789"[b % 33])
      .join("");
    const { error } = await supabaseAdmin.from("chat_app_links").insert({
      token,
      nome: data.nome?.trim() || "Chat VIA AIR",
      user_id: context.userId,
      pin_hash: await hashPinLink(token, data.pin),
      destino: data.destino,
    });
    if (error) throw new Error(error.message);
    return { token };
  });

/** Remove um link de app. */
export const removerLinkChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("chat_app_links").delete().eq("id", data.id);
    return { ok: true as const };
  });

/**
 * Abre o app pelo link secreto: confere o PIN, registra este aparelho por
 * 30 dias (cookie httpOnly) e devolve o token para restaurar a sessão.
 */
export const abrirLinkChat = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) =>
    z.object({ token: z.string().min(10).max(40), pin: z.string().regex(/^\d{4}$/), destino: z.enum(["chat", "admin"]) }).parse(raw),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: link } = await supabaseAdmin
      .from("chat_app_links")
      .select("id, token, nome, user_id, pin_hash, ativo, destino")
      .eq("token", data.token)
      .eq("destino", data.destino)
      .maybeSingle();
    if (!link || !link.ativo) throw new Error("Link inválido ou desativado.");
    if ((await hashPinLink(link.token, data.pin)) !== link.pin_hash) throw new Error("PIN incorreto.");

    const { data: u } = await supabaseAdmin.auth.admin.getUserById(link.user_id);
    const email = u?.user?.email;
    if (!email) throw new Error("Usuário do link sem e-mail cadastrado.");

    const { data: magic, error: magicErr } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (magicErr || !magic?.properties?.hashed_token) {
      throw new Error(magicErr?.message || "Não foi possível abrir a sessão.");
    }

    // Registra o aparelho para não cair antes dos 30 dias.
    const req = getRequest();
    const bruto = bytesParaHex(crypto.getRandomValues(new Uint8Array(32)).buffer);
    const salt = bytesParaHex(crypto.getRandomValues(new Uint8Array(16)).buffer);
    await supabaseAdmin.from("chat_device_sessions").insert({
      user_id: link.user_id,
      token_hash: await sha256Hex(bruto),
      pin_hash: await hashPin(data.pin, salt),
      label: link.nome,
      user_agent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
      expires_at: new Date(Date.now() + DIAS * 864e5).toISOString(),
    });
    setResponseHeader("Set-Cookie", montarCookie(bruto, DIAS * 86400));

    await supabaseAdmin
      .from("chat_app_links")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", link.id);

    return { ok: true as const, email, tokenHash: magic.properties.hashed_token };
  });
