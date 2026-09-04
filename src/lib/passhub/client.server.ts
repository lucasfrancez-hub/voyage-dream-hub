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
const NEXUS_BASE = "https://nexus.passhub.com.br";

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

export const passhubBases = { auth: AUTH_BASE, voo: VOO_BASE, multi: MULTI_BASE, nexus: NEXUS_BASE };

function credenciais() {
  const email = (process.env["PASSHUB_EMAIL"] ?? "").trim();
  const senha = process.env["PASSHUB_PASSWORD"] ?? "";
  if (!email || !senha) {
    throw new PassHubError("PASSHUB_EMAIL/PASSHUB_PASSWORD não configurados", 500);
  }
  return { email, senha };
}

type LoginPassHub = {
  token?: string;
  access_token?: string;
  mfa_token?: string;
  canais?: string[];
  telefone_mascarado?: string | null;
};

async function postAuth(path: string, body: Record<string, unknown>): Promise<{
  ok: boolean;
  status: number;
  json: Record<string, unknown>;
  texto: string;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${AUTH_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const texto = await res.text();
    let json: Record<string, unknown> = {};
    try {
      json = texto ? (JSON.parse(texto) as Record<string, unknown>) : {};
    } catch {
      /* resposta de erro pode não ser JSON */
    }
    return { ok: res.ok, status: res.status, json, texto };
  } finally {
    clearTimeout(timer);
  }
}

function tokenDaResposta(json: Record<string, unknown>): string | null {
  const token = json["token"] ?? json["access_token"];
  return typeof token === "string" && token ? token : null;
}

/**
 * Completa o MFA adotado pela PassHub em setembro/2026. O código é enviado
 * para o celular cadastrado e pode entrar pela caixa automática ou pela tela
 * Códigos de autenticação, sem nunca aparecer nos logs.
 */
async function concluirMfa(login: LoginPassHub, email: string): Promise<string> {
  const mfaToken = login.mfa_token;
  if (!mfaToken) throw new PassHubError("PassHub exigiu verificação, mas não iniciou o desafio", 502);

  const canais = Array.isArray(login.canais) ? login.canais : [];
  const canal = canais.includes("whatsapp") ? "whatsapp" : canais.includes("sms") ? "sms" : null;
  if (!canal) throw new PassHubError("A PassHub não ofereceu um canal para enviar o código", 502);

  // Abrimos a tentativa antes do envio para não perder códigos que cheguem rápido.
  const { iniciarTentativa, aguardarCodigo } = await import("@/lib/auth-code/service.server");
  const tentativa = await iniciarTentativa({ provider: "passhub", loginHint: email });
  const envio = await postAuth("/auth/mfa/enviar", { mfa_token: mfaToken, canal });
  if (!envio.ok) {
    const motivo = typeof envio.json["message"] === "string" ? envio.json["message"] : "envio recusado";
    throw new PassHubError(`PassHub não enviou o código (${motivo})`, envio.status);
  }

  const espera = await aguardarCodigo({
    authAttemptId: tentativa.authAttemptId,
    provider: "passhub",
    requestedAt: tentativa.requestedAt,
    timeoutMs: 180_000,
  });
  if (!espera.success) {
    throw new PassHubError(
      "Código da PassHub não recebido. Digite-o em Códigos de autenticação e tente novamente.",
      408,
    );
  }

  const verificacao = await postAuth("/auth/mfa/verificar", {
    mfa_token: mfaToken,
    codigo: espera.code,
  });
  const token = tokenDaResposta(verificacao.json);
  if (!verificacao.ok || !token) {
    const motivo =
      typeof verificacao.json["message"] === "string"
        ? verificacao.json["message"]
        : typeof verificacao.json["code"] === "string"
          ? verificacao.json["code"]
          : "código recusado";
    throw new PassHubError(`Verificação PassHub falhou (${motivo})`, verificacao.status);
  }
  return token;
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
    const login = await postAuth("/auth/login", { email, password: senha });
    if (!login.ok) {
      throw new PassHubError(`Login PassHub falhou (${login.status})`, login.status, login.texto.slice(0, 400));
    }
    const resposta = login.json as LoginPassHub;
    const tokenDireto = tokenDaResposta(login.json);
    const token = tokenDireto ?? (await concluirMfa(resposta, email));
    cache = { token, expiraEm: expiraDoJwt(token) };
    return token;
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
export async function passhubPing(): Promise<{ ok: boolean; conta?: string; erro?: string }> {
  try {
    const conta = await passhubRequest<Record<string, unknown>>(`${AUTH_BASE}/auth/me`, { method: "GET" });
    return { ok: true, conta: JSON.stringify(conta).slice(0, 2000) };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
}
