/**
 * Conector PassHub — autenticação e transporte. SERVER-ONLY.
 *
 * A PassHub não publica API de parceiro: usamos o mesmo contrato do painel
 * (login por e-mail/senha da agência → JWT Bearer). Credenciais ficam nos
 * segredos e nunca chegam ao navegador.
 */

const AUTH_BASE = "https://emissor-auth.passhub.com.br";
const VOO_BASE = "https://api-voo.passhub.com.br";
const MULTI_BASE = "https://busca-multi.passhub.com.br";

const TIMEOUT_MS = 60_000;

export class PassHubError extends Error {
  status: number;
  detalhe?: unknown;
  constructor(message: string, status = 500, detalhe?: unknown) {
    super(message);
    this.name = "PassHubError";
    this.status = status;
    this.detalhe = detalhe;
  }
}

export const passhubBases = { auth: AUTH_BASE, voo: VOO_BASE, multi: MULTI_BASE };

function credenciais() {
  const email = (process.env["PASSHUB_EMAIL"] ?? "").trim();
  const senha = process.env["PASSHUB_PASSWORD"] ?? "";
  if (!email || !senha) {
    throw new PassHubError("PASSHUB_EMAIL/PASSHUB_PASSWORD não configurados", 500);
  }
  return { email, senha };
}

/* --------------------------------- token --------------------------------- */

type TokenCache = { token: string; expiraEm: number };
let cache: TokenCache | null = null;
let inflight: Promise<string> | null = null;

/** Expiração real do JWT (com folga de 2 min); fallback de 30 min. */
function expiraDoJwt(token: string): number {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1] ?? "", "base64").toString("utf8"),
    ) as { exp?: number };
    if (payload.exp) return payload.exp * 1000 - 120_000;
  } catch {
    /* token opaco */
  }
  return Date.now() + 30 * 60_000;
}

export async function passhubToken(): Promise<string> {
  if (cache && Date.now() < cache.expiraEm) return cache.token;
  if (inflight) return inflight;

  inflight = (async () => {
    const { email, senha } = credenciais();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${AUTH_BASE}/auth/login-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email, password: senha }),
        signal: controller.signal,
      });
      const texto = await res.text();
      if (!res.ok) {
        throw new PassHubError(`Login PassHub falhou (${res.status})`, res.status, texto.slice(0, 400));
      }
      const json = JSON.parse(texto) as { token?: string; access_token?: string };
      const token = json.token ?? json.access_token;
      if (!token) throw new PassHubError("PassHub não retornou token", 502);
      cache = { token, expiraEm: expiraDoJwt(token) };
      return token;
    } finally {
      clearTimeout(timer);
    }
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

export function passhubInvalidarToken(): void {
  cache = null;
}

/* ------------------------------- requisição ------------------------------- */

export async function passhubRequest<T>(
  url: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<T> {
  const executar = async (token: string) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      return await fetch(url, {
        method: init.method ?? "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(init.headers ?? {}),
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  };

  let res = await executar(await passhubToken());
  if (res.status === 401 || res.status === 403) {
    passhubInvalidarToken();
    res = await executar(await passhubToken());
  }

  const texto = await res.text();
  if (!res.ok) {
    throw new PassHubError(`PassHub respondeu ${res.status}`, res.status, texto.slice(0, 1500));
  }
  try {
    return JSON.parse(texto) as T;
  } catch {
    throw new PassHubError("Resposta PassHub inválida (não é JSON)", 502, texto.slice(0, 500));
  }
}

/** Diagnóstico: valida credenciais fazendo login + /auth/me. */
export async function passhubPing(): Promise<{ ok: boolean; conta?: unknown; erro?: string }> {
  try {
    const conta = await passhubRequest<unknown>(`${AUTH_BASE}/auth/me`, { method: "GET" });
    return { ok: true, conta };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
}
