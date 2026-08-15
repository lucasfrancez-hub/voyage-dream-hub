/**
 * FRT / Infotravel — conector backend SOMENTE LEITURA.
 *
 * Regras absolutas:
 *  - nunca reservar, adicionar ao carrinho, confirmar, cancelar ou enviar passageiro;
 *  - credenciais e cookies só existem aqui (backend);
 *  - nada de HTML bruto vai para o front-end.
 */
import {
  FrtError,
  FRT_FIELDS,
  extractPartialUpdates,
  extractViewState,
  detectLoginButtonName,
  looksLikeLoginPage,
  looksLikeSessionExpired,
  maskSensitive,
  parseResultadosHtml,
  resolveSearchFields,
  toBrDate,
  type FrtSearchInput,
  type FrtSearchResponse,
} from "./frt-parse";

const BASE = "https://frt.infotravel.com.br/infotravel";
const LOGIN_URL = `${BASE}/login.xhtml`;
const VENDA_URL = `${BASE}/admin/venda/venda.xhtml`;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const TIMEOUT_MS = 45_000;
const SESSION_TTL_MS = 20 * 60_000;
const LOGIN_COOLDOWN_MS = 60_000;
const MAX_LOGIN_FAILS = 3;

/* ---------------------- cookie jar em memória ---------------------- */

type Session = {
  cookies: Map<string, string>;
  viewState: string | null;
  createdAt: number;
};

let session: Session | null = null;
let loginFails = 0;
let blockedUntil = 0;
let inflightLogin: Promise<Session> | null = null;

const log: string[] = [];
function trace(msg: string) {
  const line = `[${new Date().toISOString()}] ${maskSensitive(msg)}`;
  log.push(line);
  if (log.length > 200) log.shift();
  console.log(`[FRT] ${line}`);
}
export function frtTraceLog(): string[] {
  return [...log];
}

function cookieHeader(s: Session): string {
  return [...s.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function absorbCookies(s: Session, res: Response) {
  const raw =
    (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ??
    (res.headers.get("set-cookie") ? [res.headers.get("set-cookie")!] : []);
  for (const c of raw) {
    for (const part of c.split(/,(?=[^;]+=)/)) {
      const first = part.split(";")[0]?.trim();
      if (!first) continue;
      const eq = first.indexOf("=");
      if (eq <= 0) continue;
      s.cookies.set(first.slice(0, eq), first.slice(eq + 1));
    }
  }
}

async function frtFetch(
  s: Session,
  url: string,
  init: RequestInit & { body?: string } = {},
): Promise<{ res: Response; body: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...init,
      redirect: "manual",
      signal: ctrl.signal,
      headers: {
        "User-Agent": UA,
        Accept:
          init.headers && "Faces-Request" in (init.headers as object)
            ? "application/xml, text/xml, */*; q=0.01"
            : "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9",
        ...(s.cookies.size ? { Cookie: cookieHeader(s) } : {}),
        ...(init.headers as Record<string, string> | undefined),
      },
    });
    absorbCookies(s, res);
    let body = await res.text();
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      const next = new URL(loc, url).toString();
      trace(`redirect -> ${next}`);
      const followed = await frtFetch(s, next, { headers: init.headers });
      body = followed.body;
      return { res: followed.res, body };
    }
    return { res, body };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/abort/i.test(msg)) throw new FrtError("FRT_TIMEOUT", "Tempo esgotado na FRT");
    throw new FrtError("FRT_NETWORK_ERROR", "Falha de rede ao acessar a FRT", msg);
  } finally {
    clearTimeout(timer);
  }
}

/* ----------------------------- login ------------------------------ */

function credentials() {
  const user = process.env["FRT_USERNAME"];
  const pass = process.env["FRT_PASSWORD"];
  if (!user || !pass) {
    throw new FrtError(
      "FRT_MISSING_CREDENTIALS",
      "Credenciais FRT_USERNAME/FRT_PASSWORD não configuradas",
    );
  }
  return { user, pass };
}

async function doLogin(): Promise<Session> {
  if (Date.now() < blockedUntil) {
    throw new FrtError(
      "FRT_AUTH_FAILED",
      "Muitas tentativas de login na FRT. Aguarde alguns instantes.",
    );
  }
  const { user, pass } = credentials();
  const s: Session = { cookies: new Map(), viewState: null, createdAt: Date.now() };

  trace("GET login.xhtml");
  const first = await frtFetch(s, LOGIN_URL);
  const vs = extractViewState(first.body);
  if (!vs) {
    throw new FrtError(
      "FRT_STRUCTURE_CHANGED",
      "ViewState não encontrado na tela de login",
      "javax.faces.ViewState (login.xhtml)",
    );
  }
  const btn = detectLoginButtonName(first.body) ?? "j_idt33";
  trace(`botão de login detectado: ${btn}`);

  const form = new URLSearchParams();
  form.set("frmMaster", "frmMaster");
  form.set("login-usuario-input", user);
  form.set("login-senha-input", pass);
  form.set(btn, btn);
  form.set("javax.faces.ViewState", vs);

  trace("POST login.xhtml");
  const posted = await frtFetch(s, LOGIN_URL, {
    method: "POST",
    body: form.toString(),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Origin: "https://frt.infotravel.com.br",
      Referer: LOGIN_URL,
    },
  });

  // Validação real: acessar a área autenticada.
  const venda = await frtFetch(s, VENDA_URL, { headers: { Referer: LOGIN_URL } });
  const negado = looksLikeLoginPage(venda.body) || (!s.cookies.size && looksLikeLoginPage(posted.body));
  if (negado) {
    loginFails += 1;
    if (loginFails >= MAX_LOGIN_FAILS) {
      blockedUntil = Date.now() + LOGIN_COOLDOWN_MS;
      loginFails = 0;
    }
    throw new FrtError("FRT_AUTH_FAILED", "Login FRT recusado (voltou para login.xhtml)");
  }

  const vsVenda = extractViewState(venda.body);
  if (!vsVenda) {
    throw new FrtError(
      "FRT_STRUCTURE_CHANGED",
      "ViewState não encontrado na tela de venda",
      "javax.faces.ViewState (venda.xhtml)",
    );
  }
  s.viewState = vsVenda;
  loginFails = 0;
  trace("login OK — sessão autenticada");
  return s;
}

async function getSession(force = false): Promise<Session> {
  if (!force && session && Date.now() - session.createdAt < SESSION_TTL_MS) {
    return session;
  }
  if (inflightLogin) return inflightLogin;
  inflightLogin = doLogin()
    .then((s) => {
      session = s;
      return s;
    })
    .finally(() => {
      inflightLogin = null;
    });
  return inflightLogin;
}

export function frtInvalidateSession() {
  session = null;
}

/* ----------------------- tela de consulta -------------------------- */

async function loadVendaScreen(s: Session) {
  const { body } = await frtFetch(s, VENDA_URL, { headers: { Referer: BASE } });
  if (looksLikeLoginPage(body)) throw new FrtError("FRT_SESSION_EXPIRED");
  const vs = extractViewState(body);
  if (!vs) {
    throw new FrtError(
      "FRT_STRUCTURE_CHANGED",
      "ViewState ausente em venda.xhtml",
      "javax.faces.ViewState",
    );
  }
  s.viewState = vs;
  const resolved = resolveSearchFields(body);
  if (resolved.changed.length) trace(`campos alterados: ${resolved.changed.join(" | ")}`);
  if (resolved.missing.length) {
    trace(`campos ausentes: ${resolved.missing.join(", ")}`);
    throw new FrtError(
      "FRT_STRUCTURE_CHANGED",
      "Formulário de pesquisa da FRT mudou",
      resolved.missing.join(", "),
    );
  }
  return resolved.fields;
}

/* --------------------------- pesquisa ------------------------------ */

async function runSearch(
  s: Session,
  input: FrtSearchInput,
): Promise<{ results: FrtSearchResponse["results"]; availableResults: number }> {
  const fields = await loadVendaScreen(s);
  const adultos = input.adultos ?? 1;
  const criancas = input.criancas ?? 0;

  const p = new URLSearchParams();
  p.set("javax.faces.partial.ajax", "true");
  p.set("javax.faces.source", fields.botao);
  p.set("javax.faces.partial.execute", "@all");
  p.set(
    "javax.faces.partial.render",
    "frmPesquisaMenu:idCarrinho pnlFiltro pnlResultado pnlPacoteResumo",
  );
  p.set(fields.botao, fields.botao);
  p.set(FRT_FIELDS.form, FRT_FIELDS.form);
  p.set(fields.origem, input.origem);
  p.set(fields.destino, input.destino);
  p.set(fields.ida, toBrDate(input.ida));
  if (input.volta) p.set(fields.volta, toBrDate(input.volta));
  p.set(fields.pais, input.pais ?? "");
  p.set(fields.companhia, input.companhia ?? "");
  p.set("frmMotorPacote:qtdAdultosPacote_input", String(adultos));
  p.set("frmMotorPacote:qtdCriancasPacote_input", String(criancas));
  p.set("javax.faces.ViewState", s.viewState ?? "");

  trace(`POST pesquisa ${input.origem}->${input.destino} ${input.ida}`);
  const { body } = await frtFetch(s, VENDA_URL, {
    method: "POST",
    body: p.toString(),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "Faces-Request": "partial/ajax",
      "X-Requested-With": "XMLHttpRequest",
      Origin: "https://frt.infotravel.com.br",
      Referer: VENDA_URL,
    },
  });

  if (looksLikeSessionExpired(body)) throw new FrtError("FRT_SESSION_EXPIRED");

  const novoVs = extractViewState(body);
  if (novoVs) s.viewState = novoVs;

  const updates = extractPartialUpdates(body);
  const chaves = Object.keys(updates);
  if (!chaves.length) {
    throw new FrtError(
      "FRT_STRUCTURE_CHANGED",
      "Resposta da FRT sem blocos <update>",
      "partial-response/update",
    );
  }
  const html = chaves
    .filter((k) => /resultado|pacote|pnl/i.test(k))
    .map((k) => updates[k]!)
    .join("\n");

  return parseResultadosHtml(html || Object.values(updates).join("\n"));
}

/**
 * Consulta somente leitura na FRT/Infotravel.
 * Faz UM único relogin quando a sessão expira; nunca entra em loop.
 */
export async function consultarFRT(input: FrtSearchInput): Promise<FrtSearchResponse> {
  const base: FrtSearchResponse = {
    success: false,
    source: "FRT",
    search: {
      origin: input.origem,
      destination: input.destino,
      departureDate: input.ida,
      returnDate: input.volta ?? null,
      adults: input.adultos ?? 1,
      children: input.criancas ?? 0,
    },
    results: [],
    availableResults: 0,
    searchedAt: new Date().toISOString(),
  };

  try {
    let s = await getSession();
    try {
      const out = await runSearch(s, input);
      return { ...base, success: true, ...out, searchedAt: new Date().toISOString() };
    } catch (e) {
      if (e instanceof FrtError && e.code === "FRT_SESSION_EXPIRED") {
        trace("sessão expirada — refazendo login (tentativa única)");
        frtInvalidateSession();
        s = await getSession(true);
        const out = await runSearch(s, input);
        return { ...base, success: true, ...out, searchedAt: new Date().toISOString() };
      }
      throw e;
    }
  } catch (e) {
    if (e instanceof FrtError) {
      const code = e.code === "FRT_SESSION_EXPIRED" ? "FRT_AUTH_FAILED" : e.code;
      trace(`erro ${code}: ${e.message}${e.detail ? ` (${e.detail})` : ""}`);
      return { ...base, error: code, message: e.message };
    }
    const msg = e instanceof Error ? e.message : String(e);
    trace(`erro inesperado: ${msg}`);
    return { ...base, error: "FRT_NETWORK_ERROR", message: "Falha ao consultar a FRT" };
  }
}

/** Diagnóstico read-only: login + leitura da tela de venda (sem pesquisar). */
export async function frtDiagnostico() {
  try {
    frtInvalidateSession();
    const s = await getSession(true);
    const { body } = await frtFetch(s, VENDA_URL);
    const resolved = resolveSearchFields(body);
    return {
      ok: !looksLikeLoginPage(body),
      autenticado: !looksLikeLoginPage(body),
      viewStatePresente: Boolean(extractViewState(body)),
      cookies: [...s.cookies.keys()],
      campos: resolved.fields,
      camposAusentes: resolved.missing,
      camposAlterados: resolved.changed,
      log: frtTraceLog().slice(-30),
    };
  } catch (e) {
    const err = e instanceof FrtError ? e : null;
    return {
      ok: false,
      autenticado: false,
      viewStatePresente: false,
      cookies: [] as string[],
      campos: null,
      camposAusentes: [] as string[],
      camposAlterados: [] as string[],
      erro: err?.code ?? "FRT_NETWORK_ERROR",
      mensagem: err?.message ?? "Falha ao conectar na FRT",
      log: frtTraceLog().slice(-30),
    };
  }
}
