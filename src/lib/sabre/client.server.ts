/**
 * Conector Sabre — camada de autenticação e transporte. SERVER-ONLY.
 *
 * Credenciais (PCC, EPR, Client ID/Secret) NUNCA saem daqui: o front recebe
 * somente dados normalizados.
 */
import type { SabreAmbiente } from "./types";

const HOSTS: Record<SabreAmbiente, string> = {
  cert: "https://api-crt.cert.havail.sabre.com",
  prod: "https://api.havail.sabre.com",
};

const TIMEOUT_MS = 45_000;

export class SabreError extends Error {
  status: number;
  detalhe?: unknown;
  constructor(message: string, status = 500, detalhe?: unknown) {
    super(message);
    this.name = "SabreError";
    this.status = status;
    this.detalhe = detalhe;
  }
}

export function sabreAmbiente(): SabreAmbiente {
  const raw = (process.env["SABRE_ENV"] ?? "cert").trim().toLowerCase();
  return raw === "prod" || raw === "production" ? "prod" : "cert";
}

export function sabreBaseUrl(): string {
  return HOSTS[sabreAmbiente()];
}

export function sabrePcc(): string {
  const pcc = (process.env["SABRE_PCC"] ?? "").trim();
  if (!pcc) throw new SabreError("SABRE_PCC não configurado", 500);
  return pcc;
}

function credenciais() {
  const id = (process.env["SABRE_CLIENT_ID"] ?? "").trim();
  const secret = (process.env["SABRE_CLIENT_SECRET"] ?? "").trim();
  if (!id || !secret) throw new SabreError("SABRE_CLIENT_ID/SABRE_CLIENT_SECRET não configurados", 500);
  return { id, secret };
}

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

/* ------------------------------- token ------------------------------- */

type TokenCache = { token: string; expiraEm: number; ambiente: SabreAmbiente };
let cache: TokenCache | null = null;
let inflight: Promise<string> | null = null;

async function pedirToken(basic: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(`${sabreBaseUrl()}/v2/auth/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Token sessionless (OAuth2 client_credentials).
 *
 * O Sabre aceita duas montagens de credencial: base64(base64(id):base64(secret))
 * (Access Token v2) e base64(id:secret). Tentamos a v2 e caímos para a simples
 * quando a operadora responde 401 — assim funciona com credencial do portal ou
 * do account manager sem exigir configuração extra.
 */
export async function sabreToken(): Promise<string> {
  const amb = sabreAmbiente();
  if (cache && cache.ambiente === amb && Date.now() < cache.expiraEm) return cache.token;
  if (inflight) return inflight;

  inflight = (async () => {
    const { id, secret } = credenciais();
    const tentativas = [b64(`${b64(id)}:${b64(secret)}`), b64(`${id}:${secret}`)];
    let ultimoErro = "";
    for (const basic of tentativas) {
      const res = await pedirToken(basic);
      const texto = await res.text();
      if (res.ok) {
        const json = JSON.parse(texto) as { access_token?: string; expires_in?: number };
        if (!json.access_token) throw new SabreError("Sabre não retornou access_token", 502);
        const ttl = Math.max(60, (json.expires_in ?? 604800) - 120) * 1000;
        cache = { token: json.access_token, expiraEm: Date.now() + ttl, ambiente: amb };
        return json.access_token;
      }
      ultimoErro = `${res.status} ${texto.slice(0, 300)}`;
      if (res.status !== 401 && res.status !== 400) break;
    }
    throw new SabreError(`Falha na autenticação Sabre: ${ultimoErro}`, 401);
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

/** Invalida o token (usado quando a API responde 401 no meio do fluxo). */
export function sabreInvalidarToken(): void {
  cache = null;
}

/* ------------------------------ requisição ------------------------------ */

export async function sabreRequest<T>(
  path: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<T> {
  const executar = async (token: string) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      return await fetch(`${sabreBaseUrl()}${path}`, {
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

  let res = await executar(await sabreToken());
  if (res.status === 401) {
    sabreInvalidarToken();
    res = await executar(await sabreToken());
  }

  const texto = await res.text();
  if (!res.ok) {
    throw new SabreError(`Sabre ${path} respondeu ${res.status}`, res.status, texto.slice(0, 1500));
  }
  try {
    return JSON.parse(texto) as T;
  } catch {
    throw new SabreError(`Resposta Sabre inválida em ${path}`, 502, texto.slice(0, 500));
  }
}

/** Ping de conectividade: só valida credenciais/ambiente. */
export async function sabrePing(): Promise<{ ok: boolean; ambiente: SabreAmbiente; pcc: string; erro?: string }> {
  const ambiente = sabreAmbiente();
  try {
    await sabreToken();
    return { ok: true, ambiente, pcc: sabrePcc() };
  } catch (e) {
    return {
      ok: false,
      ambiente,
      pcc: (process.env["SABRE_PCC"] ?? "").trim(),
      erro: e instanceof Error ? e.message : String(e),
    };
  }
}
