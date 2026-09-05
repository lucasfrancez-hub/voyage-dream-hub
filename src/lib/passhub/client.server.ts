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
  // SMS primeiro: o WhatsApp mascara "senha descartável" no celular principal
  // e não entrega o código aos aparelhos conectados (UazAPI não consegue ler).
  const canal = canais.includes("sms") ? "sms" : canais.includes("whatsapp") ? "whatsapp" : null;
  if (!canal) throw new PassHubError("A PassHub não ofereceu um canal para enviar o código", 502);
  console.log(`[passhub] verificação em duas etapas detectada — canal escolhido: ${canal}`);

  // Abrimos a tentativa antes do envio para não perder códigos que cheguem rápido.
  const { iniciarTentativa, aguardarCodigo } = await import("@/lib/auth-code/service.server");
  const tentativa = await iniciarTentativa({ provider: "passhub", loginHint: email });
  const envio = await postAuth("/auth/mfa/enviar", { mfa_token: mfaToken, canal });
  if (!envio.ok) {
    const motivo =
      typeof envio.json["message"] === "string"
        ? envio.json["message"]
        : typeof envio.json["code"] === "string"
          ? (envio.json["code"] as string)
          : "envio recusado";
    console.warn(`[passhub] envio do código recusado (${envio.status}): ${motivo}`);
    throw new PassHubError(`PassHub não enviou o código (${motivo})`, envio.status);
  }
  console.log(`[passhub] código solicitado por ${canal}; aguardando chegada na caixa de códigos`);

  const espera = await aguardarCodigo({
    authAttemptId: tentativa.authAttemptId,
    provider: "passhub",
    requestedAt: tentativa.requestedAt,
    timeoutMs: 180_000,
  });
  if (!espera.success) {
    console.warn("[passhub] código não chegou dentro do tempo limite");
    throw new PassHubError(
      "Código da PassHub não recebido. Digite-o em Códigos de autenticação e tente novamente.",
      408,
    );
  }
  console.log("[passhub] código recebido — preenchendo verificação");

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
    console.warn(`[passhub] verificação recusada (${verificacao.status}): ${motivo}`);
    throw new PassHubError(`Verificação PassHub falhou (${motivo})`, verificacao.status);
  }
  console.log("[passhub] verificação concluída com sucesso");
  return token;
}

/* --------------------------------- token --------------------------------- */

type TokenCache = { token: string; expiraEm: number };
let cache: TokenCache | null = null;
let inflight: Promise<string> | null = null;

const SESSAO_ID = "default";

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

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/**
 * Sessão guardada no banco: o servidor roda sem estado, então sem isso cada
 * processo novo pediria um código de verificação. O token nunca vai ao log.
 */
async function sessaoSalva(): Promise<TokenCache | null> {
  try {
    const { data } = await (await db())
      .from("passhub_sessions")
      .select("token, expires_at")
      .eq("id", SESSAO_ID)
      .maybeSingle();
    const linha = data as { token?: string; expires_at?: string } | null;
    if (!linha?.token || !linha.expires_at) return null;
    const expiraEm = new Date(linha.expires_at).getTime();
    if (!Number.isFinite(expiraEm) || Date.now() >= expiraEm) return null;
    return { token: linha.token, expiraEm };
  } catch (e) {
    console.warn(`[passhub] não foi possível ler a sessão salva: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

async function salvarSessao(sessao: TokenCache): Promise<void> {
  try {
    await (await db()).from("passhub_sessions").upsert(
      {
        id: SESSAO_ID,
        token: sessao.token,
        expires_at: new Date(sessao.expiraEm).toISOString(),
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "id" },
    );
    const minutos = Math.round((sessao.expiraEm - Date.now()) / 60000);
    console.log(`[passhub] sessão salva e reaproveitável por ~${minutos} min`);
  } catch (e) {
    console.warn(`[passhub] falha ao salvar a sessão: ${e instanceof Error ? e.message : e}`);
  }
}

async function apagarSessao(): Promise<void> {
  try {
    await (await db()).from("passhub_sessions").delete().eq("id", SESSAO_ID);
  } catch {
    /* sessão local já foi limpa */
  }
}

export async function passhubToken(): Promise<string> {
  if (cache && Date.now() < cache.expiraEm) return cache.token;
  if (inflight) return inflight;

  inflight = (async () => {
    const salva = await sessaoSalva();
    if (salva) {
      cache = salva;
      console.log("[passhub] sessão válida reaproveitada (sem novo login)");
      return salva.token;
    }

    const { email, senha } = credenciais();
    console.log("[passhub] iniciando login com e-mail e senha");
    const login = await postAuth("/auth/login", { email, password: senha });
    if (!login.ok) {
      throw new PassHubError(`Login PassHub falhou (${login.status})`, login.status, login.texto.slice(0, 400));
    }
    const resposta = login.json as LoginPassHub;
    const tokenDireto = tokenDaResposta(login.json);
    const token = tokenDireto ?? (await concluirMfa(resposta, email));
    const sessao = { token, expiraEm: expiraDoJwt(token) };
    cache = sessao;
    await salvarSessao(sessao);
    console.log("[passhub] login concluído");
    return token;
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

export async function passhubInvalidarToken(): Promise<void> {
  cache = null;
  await apagarSessao();
}

/** Estado da sessão para o painel administrativo (nunca devolve o token). */
export async function passhubSessaoStatus(): Promise<{
  conectado: boolean;
  expiraEm: string | null;
  minutosRestantes: number | null;
}> {
  const sessao = (cache && Date.now() < cache.expiraEm ? cache : null) ?? (await sessaoSalva());
  if (!sessao) return { conectado: false, expiraEm: null, minutosRestantes: null };
  return {
    conectado: true,
    expiraEm: new Date(sessao.expiraEm).toISOString(),
    minutosRestantes: Math.max(0, Math.round((sessao.expiraEm - Date.now()) / 60000)),
  };
}



/* ------------------------------- requisição ------------------------------- */

export async function passhubRequest<T>(
  url: string,
  init: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
    /** Repetições em falha temporária (5xx/timeout). Nunca usar em reservar. */
    retentativas?: number;
  } = {},
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

  const tentativas = Math.max(0, init.retentativas ?? 0);
  let ultimoErro: PassHubError | null = null;

  for (let i = 0; i <= tentativas; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 700 * i));

    let res: Response;
    try {
      res = await executar(await passhubToken());
      if (res.status === 401 || res.status === 403) {
        await passhubInvalidarToken();
        res = await executar(await passhubToken());
      }
    } catch (e) {
      // Timeout/queda de rede: também merece nova tentativa.
      ultimoErro = new PassHubError(
        e instanceof Error && e.name === "AbortError"
          ? "PassHub não respondeu a tempo"
          : `Falha de conexão com a PassHub`,
        504,
        e instanceof Error ? e.message : String(e),
      );
      continue;
    }

    const texto = await res.text();
    if (!res.ok) {
      ultimoErro = new PassHubError(
        `PassHub respondeu ${res.status}`,
        res.status,
        texto.slice(0, 1500),
      );
      // Só instabilidade (5xx) vale nova tentativa; 4xx é erro do pedido.
      if (res.status >= 500 && i < tentativas) continue;
      throw ultimoErro;
    }
    try {
      return JSON.parse(texto) as T;
    } catch {
      throw new PassHubError("Resposta PassHub inválida (não é JSON)", 502, texto.slice(0, 500));
    }
  }

  throw ultimoErro ?? new PassHubError("Falha desconhecida na PassHub", 500);
}

/** Traduz o corpo de erro da PassHub em um motivo legível para a tela. */
export function passhubMotivo(erro: unknown): string {
  const bruto = (erro as { detalhe?: unknown } | null)?.detalhe;
  const texto = typeof bruto === "string" ? bruto : bruto ? JSON.stringify(bruto) : "";
  if (!texto) return "";
  const baixo = texto.toLowerCase();
  if (/segment_unavailable|segmento sem disponibilidade/.test(baixo)) {
    return "a companhia acabou de perder a disponibilidade deste trecho — escolha outro voo ou refaça a busca";
  }
  if (/deserialization rate token|token_preview|rate token/.test(baixo)) {
    return "a oferta expirou na companhia — refaça a busca e tarife novamente";
  }
  if (/sold out|indispon|no availability|unavailable/.test(baixo)) {
    return "a companhia não tem mais essa tarifa disponível";
  }
  if (/erro no provedor|falha na comunica/.test(baixo)) {
    return "a companhia aérea está instável no momento — tente de novo em instantes";
  }
  // Procura a primeira mensagem legível em qualquer nível do corpo do erro.
  const procura = (v: unknown, nivel = 0): string => {
    if (nivel > 4 || !v || typeof v !== "object") return "";
    const o = v as Record<string, unknown>;
    for (const k of ["mensagem", "message", "erro", "error", "detail", "description", "msg"]) {
      const val = o[k];
      if (typeof val === "string" && val.trim()) return val.trim();
    }
    for (const val of Object.values(o)) {
      const achado = procura(val, nivel + 1);
      if (achado) return achado;
    }
    return "";
  };
  try {
    const achado = procura(JSON.parse(texto));
    if (achado) return achado;
  } catch {
    /* corpo não-JSON */
  }
  return texto.replace(/\s+/g, " ").trim().slice(0, 200);
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
