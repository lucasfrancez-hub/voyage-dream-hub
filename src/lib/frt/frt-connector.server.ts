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
  coletarEstadoMotor,
  decodeEntities,
  resolvePayloadAutocomplete,
  listarCamposInternosJsf,
  extractPartialUpdates,
  extractViewState,
  detectLoginButtonName,
  looksLikeLoginPage,
  looksLikeSessionExpired,
  inventarioMotorPacote,
  maskSensitive,
  parseResultadosHtml,
  resolveSearchFields,
  toBrDate,
  type FrtInventarioMotor,
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
  redirects: string[] = [],
): Promise<{ res: Response; body: string; url: string; redirects: string[] }> {
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
      redirects.push(`${res.status} ${url} -> ${next}`);
      const followed = await frtFetch(s, next, { headers: init.headers }, redirects);
      return { res: followed.res, body: followed.body, url: followed.url, redirects };
    }
    return { res, body, url, redirects };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/abort/i.test(msg)) throw new FrtError("FRT_TIMEOUT", "Tempo esgotado na FRT");
    throw new FrtError("FRT_NETWORK_ERROR", "Falha de rede ao acessar a FRT", msg);
  } finally {
    clearTimeout(timer);
  }
}

/* ------------- acesso autenticado à tela de venda ------------------ */

/**
 * Classificação do que realmente voltou de venda.xhtml. Só `estrutura`
 * significa "o formulário mudou" — todo o resto tem causa própria.
 */
export type VendaEstado =
  | "ok"
  | "login"
  | "2fa"
  | "shell"
  | "erro_http"
  | "estrutura";

export type AcessoVenda = {
  status: number;
  urlFinal: string;
  temFormulario: boolean;
  temBotaoPesquisa: boolean;
  temLogin: boolean;
  temAuthXhtml: boolean;
  voltouParaLogin: boolean;
  aguardandoCodigo: boolean;
  tamanhoHtml: number;
  titulo: string | null;
  formularios: string[];
  viewState: string | null;
  redirects: string[];
  estado: VendaEstado;
  /** Se a inicialização PrimeFaces (POST frmMasterVenda) foi disparada. */
  initExecutado: boolean;
  body: string;
};

/** Sanitiza e guarda uma amostra do HTML só para diagnóstico técnico. */
let ultimaAmostra: { em: string; url: string; estado: VendaEstado; html: string } | null = null;
export function frtUltimaAmostraHtml() {
  return ultimaAmostra;
}
/** Diagnóstico do último POST de pesquisa (resposta bruta sanitizada). */
export type FrtAmostraPesquisa = {
  em: string;
  status: number;
  bytes: number;
  updates: { id: string; bytes: number }[];
  temPnlResultado: boolean;
  /** Bytes do conteúdo do update pnlResultado (0 = não veio no partial). */
  pnlResultadoBytes: number;
  temPrecos: boolean;
  /** Total de ocorrências de preço na resposta. */
  qtdPrecos: number;
  amostraPrecos: string[];
  mensagemNenhumResultado: string | null;
  /** PrimeFaces recusou os parâmetros antes de pesquisar. */
  validationFailed: boolean;
  /** Mapa sanitizado dos campos do frmMotorPacote usados no POST. */
  inventario: FrtInventarioMotor | null;
  /** Evidências das requisições AJAX dos autocompletes, sem dados sensíveis. */
  autocomplete: {
    componente: "origem" | "destino";
    source: string;
    status: number;
    bytes: number;
    updates: string[];
    camposJsf: string[];
  }[];
  /** Nomes efetivamente escolhidos para o payload; null bloqueia a pesquisa. */
  payloadResolvido: { origem: string | null; destino: string | null };
  raw: string;
};
let ultimaAmostraPesquisa: FrtAmostraPesquisa | null = null;
let ultimoInventarioMotor: FrtInventarioMotor | null = null;
export function frtUltimaAmostraPesquisa() {
  return ultimaAmostraPesquisa;
}

function amostraSanitizada(html: string): string {
  const limpo = maskSensitive(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, "<script/>")
      .replace(/<style[\s\S]*?<\/style>/gi, "<style/>")
      .replace(/(value=")[^"]{4,}(")/gi, "$1***$2")
      .replace(/(javax\.faces\.ViewState[^>]{0,80}value=")[^"]+(")/gi, "$1<viewstate>$2"),
  );
  return limpo.length > 20_000 ? `${limpo.slice(0, 20_000)}\n…[truncado]` : limpo;
}

function listarFormularios(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<form\b[^>]*>/gi)) {
    const tag = m[0];
    const id = tag.match(/\bid="([^"]+)"/i)?.[1];
    const name = tag.match(/\bname="([^"]+)"/i)?.[1];
    const action = tag.match(/\baction="([^"]+)"/i)?.[1];
    out.push(`id=${id ?? "-"} name=${name ?? "-"} action=${action ?? "-"}`);
    if (out.length >= 8) break;
  }
  return out;
}

/** Descobre o `javax.faces.source` da inicialização (padrão: j_idt10). */
function detectarFonteInit(html: string): string[] {
  const fontes = new Set<string>();
  // O onload do PrimeFaces costuma disparar algo como PrimeFaces.ab({s:"j_idt10"...})
  for (const m of html.matchAll(/["']?s["']?\s*:\s*["'](j_idt\d+)["']/gi)) fontes.add(m[1]!);
  for (const m of html.matchAll(/source\s*:\s*["'](j_idt\d+)["']/gi)) fontes.add(m[1]!);
  fontes.add("j_idt10");
  return [...fontes].slice(0, 3);
}

/**
 * Reproduz a inicialização PrimeFaces observada no navegador: POST AJAX em
 * venda.xhtml (mesmo cookie jar + ViewState do GET) que renderiza
 * `frmMasterVenda` com o motor completo dentro de um <update> CDATA.
 */
async function inicializarMotorPrimeFaces(
  s: Session,
  viewState: string,
  htmlGet: string,
): Promise<{ html: string; viewState: string | null } | null> {
  let melhorHtml = "";
  let melhorVs: string | null = null;

  const tentativas: { source: string; render: string }[] = [];
  for (const source of detectarFonteInit(htmlGet)) {
    tentativas.push({ source, render: "frmMasterVenda" });
  }
  tentativas.push({ source: "j_idt10", render: "@all" });

  for (const t of tentativas) {
    const form = new URLSearchParams();
    form.set("javax.faces.partial.ajax", "true");
    form.set("javax.faces.source", t.source);
    form.set("javax.faces.partial.execute", "@all");
    form.set("javax.faces.partial.render", t.render);
    form.set(t.source, t.source);
    form.set("frmAguarde", "frmAguarde");
    form.set("javax.faces.ViewState", melhorVs ?? viewState);

    trace(`POST init venda.xhtml (source=${t.source} render=${t.render})`);
    try {
      const { res, body } = await frtFetch(s, VENDA_URL, {
        method: "POST",
        body: form.toString(),
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "Faces-Request": "partial/ajax",
          "X-Requested-With": "XMLHttpRequest",
          Accept: "application/xml, text/xml, */*; q=0.01",
          Origin: "https://frt.infotravel.com.br",
          Referer: VENDA_URL,
        },
      });
      const updates = extractPartialUpdates(body);
      const master = updates["frmMasterVenda"];
      const html = master ?? Object.values(updates).join("\n");
      const novoVs = extractViewState(body);
      const achouMotor = /frmMotorPacote/i.test(html);

      trace(`  status: ${res.status}`);
      trace(`  response size: ${body.length} bytes`);
      trace(`  update frmMasterVenda found: ${Boolean(master)}`);
      trace(`  updates recebidos: ${Object.keys(updates).join(", ") || "(nenhum)"}`);
      trace(`  frmMotorPacote found after init: ${achouMotor}`);

      if (html && (achouMotor || html.length > melhorHtml.length)) {
        melhorHtml = html;
        if (novoVs) melhorVs = novoVs;
      }

      if (achouMotor) return { html: melhorHtml, viewState: melhorVs };

    } catch (e) {
      trace(`  init falhou: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return melhorHtml ? { html: melhorHtml, viewState: melhorVs } : null;
}


/**
 * GET autenticado explícito em venda.xhtml, seguindo redirects e usando
 * exatamente o mesmo cookie jar. Registra TODAS as provas antes de qualquer
 * conclusão — campo ausente nunca é tratado como mudança de estrutura aqui.
 */
async function abrirVenda(s: Session, referer = BASE): Promise<AcessoVenda> {
  trace("GET venda.xhtml");
  const { res, body: htmlGet, url, redirects } = await frtFetch(s, VENDA_URL, {
    headers: { Referer: referer },
  });
  let body = htmlGet;
  let initExecutado = false;

  const precisaInit =
    !/frmMotorPacote/i.test(body) &&
    res.status < 400 &&
    !needsAuthCode(body) &&
    !/login-usuario-input/i.test(body) &&
    !/auth\.xhtml|login\.xhtml/i.test(url);
  if (precisaInit) {
    const vsGet = extractViewState(body);
    if (vsGet) {
      initExecutado = true;
      const init = await inicializarMotorPrimeFaces(s, vsGet, body);
      if (init?.html) {
        body = `${body}\n<!-- frmMasterVenda (init PrimeFaces) -->\n${init.html}`;
        if (init.viewState) s.viewState = init.viewState;
      }
    } else {
      trace("  init PrimeFaces impossível: ViewState ausente no GET");
    }
  }

  const temFormulario = /frmMotorPacote/i.test(body);

  const temBotaoPesquisa = /btnMotorPacotePesquisa/i.test(body);
  const temLogin = /login-usuario-input/i.test(body);
  const temAuthXhtml = /auth\.xhtml/i.test(body) || /auth\.xhtml/i.test(url);
  const aguardandoCodigo = needsAuthCode(body);
  const voltouParaLogin = /auth\.xhtml|login\.xhtml/i.test(url) || temLogin;
  const titulo = body.match(/<title[^>]*>([\s\S]{0,200}?)<\/title>/i)?.[1]?.trim() ?? null;
  const formularios = listarFormularios(body);
  const viewState = extractViewState(body);

  let estado: VendaEstado;
  if (aguardandoCodigo) estado = "2fa";
  else if (voltouParaLogin) estado = "login";
  else if (res.status >= 400) estado = "erro_http";
  else if (temFormulario || temBotaoPesquisa) estado = "ok";
  else estado = "shell";

  trace(`  status: ${res.status}`);
  trace(`  URL final: ${url}`);
  trace(`  tamanho do HTML: ${body.length} bytes`);
  trace(`  HTML contém "frmMotorPacote": ${temFormulario}`);
  trace(`  HTML contém "btnMotorPacotePesquisa": ${temBotaoPesquisa}`);
  trace(`  HTML contém "login-usuario-input": ${temLogin}`);
  trace(`  HTML referencia "auth.xhtml": ${temAuthXhtml}`);
  trace(`  título da página: ${titulo ?? "(sem título)"}`);
  trace(`  formulários: ${formularios.length ? formularios.join(" | ") : "(nenhum)"}`);
  trace(`  javax.faces.ViewState: ${viewState ? "encontrado" : "AUSENTE"}`);
  trace(`  redirects: ${redirects.length ? redirects.join(" | ") : "(nenhum)"}`);
  trace(`  init PrimeFaces executado: ${initExecutado}`);
  trace(`  estado classificado: ${estado}`);

  if (estado !== "ok") {
    ultimaAmostra = {
      em: new Date().toISOString(),
      url,
      estado,
      html: amostraSanitizada(body),
    };
    if (estado === "login") {
      trace("  ⚠️ sessão não reaproveitada — voltou para login/auth (FRT_AUTH_REQUIRED)");
    } else if (estado === "2fa") {
      trace("  ⚠️ FRT aguardando código de verificação (FRT_2FA_REQUIRED)");
    } else if (estado === "erro_http") {
      trace(`  ⚠️ venda.xhtml respondeu HTTP ${res.status} (FRT_VENDA_NOT_LOADED)`);
    } else {
      trace(
        "  ⚠️ venda.xhtml abriu autenticado, mas sem o motor de pesquisa — provável shell da aplicação ou conteúdo carregado por AJAX (FRT_VENDA_NOT_LOADED). Amostra sanitizada do HTML guardada para diagnóstico.",
      );
    }
  }

  return {
    status: res.status,
    urlFinal: url,
    temFormulario,
    temBotaoPesquisa,
    temLogin,
    temAuthXhtml,
    voltouParaLogin,
    aguardandoCodigo,
    tamanhoHtml: body.length,
    titulo,
    formularios,
    viewState,
    redirects,
    estado,
    initExecutado,
    body,
  };
}

/** Erro correto para cada estado que NÃO é "ok". Nunca devolve estrutura. */
function erroDoEstado(v: AcessoVenda): FrtError {
  if (v.estado === "2fa") {
    return new FrtError(
      "FRT_2FA_REQUIRED",
      "A FRT está pedindo o código de verificação por e-mail.",
    );
  }
  if (v.estado === "login") {
    return new FrtError(
      "FRT_AUTH_REQUIRED",
      "A sessão não está autenticada na FRT (venda.xhtml voltou para login/auth).",
      `URL final: ${v.urlFinal}`,
    );
  }
  return new FrtError(
    "FRT_VENDA_NOT_LOADED",
    v.estado === "erro_http"
      ? `venda.xhtml respondeu HTTP ${v.status}.`
      : `venda.xhtml abriu autenticado e a inicialização PrimeFaces ${v.initExecutado ? "foi executada" : "não pôde ser executada"}, mas o motor de pesquisa não apareceu.`,
    `init=${v.initExecutado} status=${v.status} bytes=${v.tamanhoHtml} título=${v.titulo ?? "-"} forms=${v.formularios.join(" | ") || "-"}`,
  );
}

/** Resumo (sem HTML bruto) do acesso à venda, seguro para o front-end. */
function resumoAcesso(v: AcessoVenda) {
  return {
    status: v.status,
    urlFinal: v.urlFinal,
    temFormulario: v.temFormulario,
    temBotaoPesquisa: v.temBotaoPesquisa,
    temLogin: v.temLogin,
    temAuthXhtml: v.temAuthXhtml,
    voltouParaLogin: v.voltouParaLogin,
    aguardandoCodigo: v.aguardandoCodigo,
    tamanhoHtml: v.tamanhoHtml,
    titulo: v.titulo,
    formularios: v.formularios,
    viewStatePresente: Boolean(v.viewState),
    redirects: v.redirects,
    estado: v.estado,
    initExecutado: v.initExecutado,
  };
}
export type ResumoAcessoVenda = ReturnType<typeof resumoAcesso>;

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
  if (pendingAuth) {
    // Nunca reiniciar login enquanto houver desafio 2FA aguardando código.
    throw new FrtError(
      "FRT_2FA_REQUIRED",
      "Já existe um código de verificação pendente na FRT. Informe o código para liberar a sessão.",
    );
  }
  if (Date.now() < blockedUntil) {
    throw new FrtError(
      "FRT_AUTH_FAILED",
      "Muitas tentativas de login na FRT. Aguarde alguns instantes.",
    );
  }
  const { user, pass } = credentials();
  const s: Session = { cookies: new Map(), viewState: null, createdAt: Date.now() };

  trace("login iniciado");
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

  // Validação real: acessar a área autenticada (GET explícito, mesmo cookie jar).
  const venda = await abrirVenda(s, LOGIN_URL);
  const negado =
    (venda.voltouParaLogin && !needsAuthCode(venda.body)) ||
    (!s.cookies.size && looksLikeLoginPage(posted.body));
  if (negado) {
    loginFails += 1;
    if (loginFails >= MAX_LOGIN_FAILS) {
      blockedUntil = Date.now() + LOGIN_COOLDOWN_MS;
      loginFails = 0;
    }
    throw new FrtError("FRT_AUTH_FAILED", "Login FRT recusado (voltou para login.xhtml)");
  }

  // O portal pode exigir código de verificação enviado por e-mail (2FA).
  if (needsAuthCode(venda.body)) {
    // No máximo 1 desafio ativo: guarda a sessão/cookie jar e o ViewState desta
    // tentativa e para aqui. Nada de novo login enquanto isso.
    pendingAuth = s;
    pendingDesde = Date.now();
    autoBuscaAtiva = true;
    autoMensagem = "Procurando o código na caixa dedicada…";
    await persistSession(s);
    trace("2FA requerido");
    trace("aguardando código");
    throw new FrtError(
      "FRT_2FA_REQUIRED",
      "A FRT enviou um código de verificação por e-mail. Informe o código (ou busque o automático) para liberar a sessão.",
    );
  }


  // Campo/ViewState ausente NÃO é mudança de estrutura: pode ser shell da
  // aplicação, carregamento por AJAX ou sessão não reaproveitada.
  if (venda.estado !== "ok") throw erroDoEstado(venda);
  if (!venda.viewState) {
    throw new FrtError(
      "FRT_VENDA_NOT_LOADED",
      "venda.xhtml abriu com o motor de pesquisa, mas sem javax.faces.ViewState.",
      `status=${venda.status} bytes=${venda.tamanhoHtml}`,
    );
  }
  s.viewState = venda.viewState;
  loginFails = 0;
  trace("login OK — venda.xhtml aberta com o motor de pesquisa");

  await persistSession(s);
  return s;
}

async function getSession(force = false): Promise<Session> {
  if (pendingAuth) {
    throw new FrtError(
      "FRT_2FA_REQUIRED",
      "Existe um desafio 2FA da FRT aguardando código. Valide o código antes de tentar novamente.",
    );
  }
  if (!force && session && Date.now() - session.createdAt < SESSION_TTL_MS) {
    return session;
  }
  if (!force) {
    const restored = await restoreSession();
    if (restored) {
      session = restored;
      return restored;
    }
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

/* --------------- 2FA (código de verificação por e-mail) --------------- */

let pendingAuth: Session | null = null;
let pendingDesde: number | null = null;
/** Busca automática do código na caixa dedicada (roda por polling, nunca bloqueia). */
let autoBuscaAtiva = false;
let autoMensagem: string | null = null;

/** Estado do desafio 2FA (para a UI de diagnóstico). */
export function frtEstado2fa() {
  return {
    pendente: Boolean(pendingAuth),
    desde: pendingDesde ? new Date(pendingDesde).toISOString() : null,
    segundos: pendingDesde ? Math.round((Date.now() - pendingDesde) / 1000) : 0,
    autoBusca: autoBuscaAtiva,
    autoMensagem,
  };
}

/** Liga/desliga a busca automática, sem esperar nada (a UI faz polling). */
export function frtBuscaAutomatica2fa(ativo: boolean) {
  autoBuscaAtiva = ativo && Boolean(pendingAuth);
  autoMensagem = autoBuscaAtiva ? "Procurando o código na caixa dedicada…" : null;
  return frtEstado2fa();
}

/**
 * Uma única verificação rápida (sem loop, sem espera) da caixa dedicada.
 * A UI chama isso em polling enquanto o desafio estiver pendente.
 */
export async function frtPoll2fa() {
  if (!pendingAuth) {
    autoBuscaAtiva = false;
    return frtEstado2fa();
  }
  if (!autoBuscaAtiva) return frtEstado2fa();
  const item = await buscarCodigoRecente(Date.now() - CODIGO_TTL_MS);
  if (!item) {
    if (pendingDesde && Date.now() - pendingDesde > CODIGO_ESPERA_MS) {
      autoBuscaAtiva = false;
      autoMensagem =
        "O código automático não chegou. Informe o código manualmente — o desafio segue ativo.";
    }
    return frtEstado2fa();
  }
  await descartarCodigo(item.id);
  trace("2FA: código encontrado — enviando para a FRT (valor não registrado)");
  const r = await frtEnviarCodigo(item.code);
  autoBuscaAtiva = false;
  autoMensagem = r.ok
    ? "Código automático validado — sessão liberada."
    : "Código automático recusado pela FRT. Informe o código manualmente.";
  return frtEstado2fa();
}

/** Descarta o desafio pendente (permite um novo login manualmente). */
export function frtCancelar2fa() {
  pendingAuth = null;
  pendingDesde = null;
  autoBuscaAtiva = false;
  autoMensagem = null;
  trace("desafio 2FA descartado manualmente");
}

/**
 * Envia o código de verificação recebido por e-mail e libera a sessão.
 * É uma etapa de autenticação — não realiza nenhuma ação de escrita comercial.
 */
export async function frtEnviarCodigo(codigo: string) {
  const s = pendingAuth ?? session ?? (await restoreSession());
  if (!s) {
    return { ok: false, erro: "FRT_AUTH_FAILED", mensagem: "Nenhuma sessão aguardando código." };
  }
  const tela = await frtFetch(s, VENDA_URL);
  const campos = detectAuthForm(tela.body);
  const vs = extractViewState(tela.body);
  if (!campos || !vs) {
    // Não é "estrutura mudou": ou a sessão caiu, ou a tela nem é a de código.
    const ehLogin = looksLikeLoginPage(tela.body) || /login-usuario-input/i.test(tela.body);
    return {
      ok: false,
      erro: ehLogin ? "FRT_AUTH_REQUIRED" : "FRT_VENDA_NOT_LOADED",
      mensagem: ehLogin
        ? "A sessão da FRT caiu antes do envio do código. Refaça o login."
        : "A tela de verificação da FRT não estava carregada nesta resposta.",
    };
  }
  const p = new URLSearchParams();
  p.set(campos.form, campos.form);
  p.set(campos.input, codigo.trim());
  p.set(campos.botao, campos.botao);
  p.set("javax.faces.ViewState", vs);

  trace("código recebido/manual");
  trace("POST código de verificação");
  const { body } = await frtFetch(s, tela.url, {
    method: "POST",
    body: p.toString(),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Origin: "https://frt.infotravel.com.br",
      Referer: tela.url,
    },
  });

  // 2FA aceito ≠ tela de venda acessível. Faz o GET autenticado explícito.
  trace("2FA aceito — validando navegação pós-login");
  const venda = await abrirVenda(s, tela.url);
  const acessoVenda = resumoAcesso(venda);
  if (venda.aguardandoCodigo || venda.voltouParaLogin || looksLikeLoginPage(body)) {
    return {
      ok: false,
      erro: (venda.aguardandoCodigo ? "FRT_2FA_REQUIRED" : "FRT_AUTH_REQUIRED") as string | null,
      mensagem: (venda.aguardandoCodigo
        ? "Código recusado pela FRT — ela segue pedindo verificação."
        : "Após o código a FRT devolveu a tela de login.") as string | null,
      aviso: null as string | null,
      acessoVenda,
    };
  }
  s.viewState = venda.viewState;
  s.createdAt = Date.now();
  session = s;
  pendingAuth = null;
  pendingDesde = null;
  autoBuscaAtiva = false;
  trace("2FA validado");
  trace("sessão liberada");
  await persistSession(s);
  if (venda.estado !== "ok") {
    trace("código aceito, mas o motor de pesquisa não apareceu em venda.xhtml");
    return {
      ok: true,
      erro: null as string | null,
      mensagem: null as string | null,
      aviso:
        "Código aceito, mas venda.xhtml abriu sem o motor de pesquisa (FRT_VENDA_NOT_LOADED — provável shell/AJAX). Amostra do HTML guardada no diagnóstico." as
          | string
          | null,
      acessoVenda,
    };
  }
  trace("código aceito — venda.xhtml acessível com o motor de pesquisa");
  return {
    ok: true,
    erro: null as string | null,
    mensagem: null as string | null,
    aviso: null as string | null,
    acessoVenda,
  };


}

/* ---------- 2FA automático via caixa dedicada (e-mail encaminhado) ---------- */

/** Janela de validade de um código recebido por e-mail. */
const CODIGO_TTL_MS = 10 * 60_000;
/** Quanto tempo esperamos o e-mail encaminhado chegar. */
const CODIGO_ESPERA_MS = 120_000;

type CodigoArmazenado = { id: string; code: string };

/** Busca o código mais recente, ainda não usado e dentro da janela. */
async function buscarCodigoRecente(desde: number): Promise<CodigoArmazenado | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("frt_auth_codes")
      .select("id, code, received_at")
      .is("used_at", null)
      .gte("received_at", new Date(desde).toISOString())
      .order("received_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data?.code) return null;
    return { id: data.id as string, code: data.code as string };
  } catch {
    return null;
  }
}

/** Descarta o código depois do uso — nada fica guardado. */
async function descartarCodigo(id: string) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("frt_auth_codes").delete().eq("id", id);
  } catch {
    /* best-effort */
  }
}

/**
 * Aguarda o código chegar na caixa dedicada e conclui a autenticação.
 * O valor do código nunca é registrado em log. A entrada manual continua
 * disponível como fallback.
 */
export async function frtResolver2faAutomatico(
  esperaMs = CODIGO_ESPERA_MS,
): Promise<{ ok: boolean; mensagem?: string }> {
  if (!pendingAuth && !session) {
    return {
      ok: false,
      mensagem: "Nenhum desafio 2FA pendente na FRT.",
    };
  }
  const inicio = Date.now();
  const janela = inicio - CODIGO_TTL_MS;
  trace("aguardando código (caixa dedicada)");
  while (Date.now() - inicio < esperaMs) {
    const item = await buscarCodigoRecente(janela);
    if (item) {
      await descartarCodigo(item.id);
      trace("2FA: código encontrado — enviando para a FRT (valor não registrado)");
      const r = await frtEnviarCodigo(item.code);
      if (r.ok) return { ok: true };
      trace(`2FA automático recusado: ${r.erro ?? "desconhecido"}`);
      return {
        ok: false,
        mensagem:
          "Código automático recusado pela FRT. Informe o código manualmente para liberar a sessão.",
      };
    }
    await new Promise((r) => setTimeout(r, 5_000));
  }
  // Sem código no prazo: mantém o desafio pendente e libera a entrada manual.
  trace("2FA: nenhum código chegou no prazo — desafio segue pendente (entrada manual)");
  return {
    ok: false,
    mensagem:
      "A FRT pediu código de verificação e nenhum e-mail chegou na caixa dedicada. Informe o código manualmente.",
  };
}

function needsAuthCode(html: string): boolean {

  return /frmAuth:chave-input|c[óo]digo de verifica[çc][ãa]o/i.test(html);
}

function detectAuthForm(html: string): { form: string; input: string; botao: string } | null {
  const input = html.match(/name="([^"]*chave-input)"/i)?.[1];
  if (!input) return null;
  const form = input.split(":")[0] ?? "frmAuth";
  const botao =
    html.match(new RegExp(`name="(${form}:j_idt\\d+)"`, "i"))?.[1] ?? `${form}:j_idt88`;
  return { form, input, botao };
}

/* ------------------- persistência da sessão (backend) ------------------ */

async function persistSession(s: Session) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("frt_sessions").upsert({
      id: "default",
      cookies: Object.fromEntries(s.cookies),
      view_state: s.viewState,
      updated_at: new Date().toISOString(),
    });
  } catch {
    /* persistência é best-effort */
  }
}

async function restoreSession(): Promise<Session | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("frt_sessions")
      .select("cookies, view_state, updated_at")
      .eq("id", "default")
      .maybeSingle();
    if (!data?.cookies) return null;
    const idade = Date.now() - new Date(data.updated_at as string).getTime();
    if (idade > SESSION_TTL_MS) return null;
    const s: Session = {
      cookies: new Map(Object.entries(data.cookies as Record<string, string>)),
      viewState: (data.view_state as string | null) ?? null,
      createdAt: Date.now() - idade,
    };
    const venda = await abrirVenda(s);
    if (venda.estado !== "ok") return null;
    s.viewState = venda.viewState;
    trace("sessão FRT restaurada do backend");

    return s;
  } catch {
    return null;
  }
}

/* ----------------------- tela de consulta -------------------------- */

async function loadVendaScreen(s: Session) {
  const venda = await abrirVenda(s);
  const body = venda.body;
  if (venda.estado === "login") throw new FrtError("FRT_SESSION_EXPIRED");
  // Shell/AJAX/erro HTTP ≠ mudança de estrutura.
  if (venda.estado !== "ok") throw erroDoEstado(venda);

  if (!venda.viewState) {
    throw new FrtError(
      "FRT_VENDA_NOT_LOADED",
      "venda.xhtml carregou o motor de pesquisa, mas sem javax.faces.ViewState.",
      `status=${venda.status} bytes=${venda.tamanhoHtml}`,
    );
  }
  s.viewState = venda.viewState;
  const resolved = resolveSearchFields(body);
  if (resolved.changed.length) trace(`campos alterados: ${resolved.changed.join(" | ")}`);
  if (resolved.missing.length) {
    trace(`campos ausentes: ${resolved.missing.join(", ")}`);
    ultimaAmostra = {
      em: new Date().toISOString(),
      url: venda.urlFinal,
      estado: "estrutura",
      html: amostraSanitizada(body),
    };
    // Só aqui a mudança de estrutura está comprovada: a tela de venda correta
    // carregou (formulário + botão presentes) e mesmo assim faltam campos.
    throw new FrtError(
      "FRT_STRUCTURE_CHANGED",
      "A tela de venda carregou corretamente, mas campos do formulário de pesquisa não existem mais",
      resolved.missing.join(", "),
    );
  }
  ultimoInventarioMotor = inventarioMotorPacote(body);
  trace(
    `  inventário frmMotorPacote: form=${ultimoInventarioMotor.encontrouForm} campos=${ultimoInventarioMotor.campos.length} scripts=${ultimoInventarioMotor.scriptsAutocomplete.length} widgets=${ultimoInventarioMotor.widgets.join(", ") || "(nenhum)"}`,
  );
  for (const c of ultimoInventarioMotor.campos.slice(0, 30)) {
    trace(`    ${c.tag} id=${c.id ?? "-"} name=${c.name ?? "-"} type=${c.type ?? "-"} valor=${c.valor}`);
  }

  const estado = coletarEstadoMotor(body);
  const payload = resolvePayloadAutocomplete(body);
  trace(`  estado do formulário: ${Object.keys(estado).length} campos capturados`);
  for (const d of payload.detalhes) trace(`  ${d}`);

  return { fields: resolved.fields, estado, payload };
}

/* --------------------------- pesquisa ------------------------------ */

/** Códigos IATA sempre em maiúsculas; texto livre fica intacto. */
function normalizarIata(v: string): string {
  const t = (v ?? "").trim();
  return /^[A-Za-z]{3}$/.test(t) ? t.toUpperCase() : t;
}

/** Conteúdo do <update id="...pnlResultado..."> (ou trecho equivalente). */
function extrairPnlResultado(
  updates: Record<string, string>,
  body: string,
): { presente: boolean; bytes: number } {
  const chave = Object.keys(updates).find((k) => /pnlResultado/i.test(k));
  if (chave) return { presente: true, bytes: updates[chave]!.length };
  const i = body.search(/pnlResultado/i);
  return { presente: i >= 0, bytes: 0 };
}



async function runSearch(
  s: Session,
  input: FrtSearchInput,
): Promise<{ results: FrtSearchResponse["results"]; availableResults: number }> {
  const { fields, estado, payload } = await loadVendaScreen(s);
  const adultos = input.adultos ?? 1;
  const criancas = input.criancas ?? 0;
  // Códigos IATA sempre em maiúsculas (MGf -> MGF).
  const origem = normalizarIata(input.origem);
  const destino = normalizarIata(input.destino);

  const diagnosticarAutocomplete = async (
    componente: "origem" | "destino",
    sourceInput: string,
    consulta: string,
  ) => {
    const source = sourceInput.replace(/_input$/, "");
    const ajax = new URLSearchParams();
    ajax.set("javax.faces.partial.ajax", "true");
    ajax.set("javax.faces.source", source);
    ajax.set("javax.faces.partial.execute", source);
    ajax.set("javax.faces.partial.render", source);
    ajax.set(source, source);
    ajax.set(`${source}_query`, consulta);
    ajax.set(FRT_FIELDS.form, FRT_FIELDS.form);
    for (const [name, valor] of Object.entries(estado)) {
      if (!name.startsWith("javax.faces")) ajax.set(name, valor);
    }
    ajax.set("javax.faces.ViewState", s.viewState ?? "");
    const resposta = await frtFetch(s, VENDA_URL, {
      method: "POST",
      body: ajax.toString(),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Faces-Request": "partial/ajax",
        "X-Requested-With": "XMLHttpRequest",
        Origin: "https://frt.infotravel.com.br",
        Referer: VENDA_URL,
      },
    });
    const updates = extractPartialUpdates(resposta.body);
    return {
      componente,
      source,
      status: resposta.res.status,
      bytes: resposta.body.length,
      updates: Object.keys(updates),
      camposJsf: listarCamposInternosJsf(resposta.body),
      raw: resposta.body,
    };
  };

  // Os campos semânticos são apenas a UI do autocomplete. Sem os campos
  // internos j_idt#### não existe payload válido de pesquisa. Em vez de cair
  // silenciosamente no _input, reproduzimos separadamente os AJAX de consulta
  // para registrar em qual resposta dinâmica esses campos aparecem.
  if (!payload.origem || !payload.destino) {
    const autocomplete = [];
    autocomplete.push(await diagnosticarAutocomplete("origem", fields.origem, input.origemLabel?.trim() || origem));
    autocomplete.push(await diagnosticarAutocomplete("destino", fields.destino, input.destinoLabel?.trim() || destino));
    for (const item of autocomplete) {
      trace(
        `  autocomplete ${item.componente}: source=${item.source} status=${item.status} bytes=${item.bytes} updates=${item.updates.join(", ") || "(nenhum)"} j_idt=${item.camposJsf.join(", ") || "(nenhum)"}`,
      );
    }
    ultimaAmostraPesquisa = {
      em: new Date().toISOString(),
      status: autocomplete.find((item) => item.status >= 400)?.status ?? 200,
      bytes: autocomplete.reduce((total, item) => total + item.bytes, 0),
      updates: autocomplete.flatMap((item) => item.updates.map((id) => ({ id: `${item.componente}:${id}`, bytes: 0 }))),
      temPnlResultado: false,
      pnlResultadoBytes: 0,
      temPrecos: false,
      qtdPrecos: 0,
      amostraPrecos: [],
      mensagemNenhumResultado: null,
      validationFailed: false,
      inventario: ultimoInventarioMotor,
      autocomplete: autocomplete.map(({ raw: _raw, ...item }) => item),
      payloadResolvido: { origem: payload.origem, destino: payload.destino },
      raw: amostraSanitizada(autocomplete.map((item) => item.raw).join("\n")),
    };
    throw new FrtError(
      "FRT_SEARCH_INCONCLUSIVE",
      "Os campos internos de origem/destino ainda não foram gerados pelo autocomplete da FRT",
      `origem=${payload.origem ?? "-"} destino=${payload.destino ?? "-"}`,
    );
  }

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

  // 1) Reproduz o estado atual do formulário como o navegador reenvia,
  //    preservando campos internos da FRT (j_idt####_input de ocupação etc.).
  for (const [name, valor] of Object.entries(estado)) {
    if (name.startsWith("javax.faces")) continue;
    p.set(name, valor);
  }

  // 2) Sobrescreve só o que é da pesquisa. Origem/destino vão nos campos reais
  //    do payload (j_idt####), não nos _input visuais do autocomplete.
  const nomeOrigem = payload.origem;
  const nomeDestino = payload.destino;
  p.set(nomeOrigem, input.origemLabel?.trim() || origem);
  p.set(nomeDestino, input.destinoLabel?.trim() || destino);
  p.set(fields.ida, toBrDate(input.ida));
  if (input.volta) p.set(fields.volta, toBrDate(input.volta));
  p.set(fields.pais, input.pais ?? estado[fields.pais] ?? "");
  p.set(fields.companhia, input.companhia ?? estado[fields.companhia] ?? "");
  p.set("javax.faces.ViewState", s.viewState ?? "");

  // Ocupação: os campos de adultos/crianças são gerados dinamicamente pela FRT
  // e o valor não é a contagem de passageiros. Mantemos a configuração atual do
  // formulário e registramos divergências até o mapeamento ser confirmado.
  if (adultos !== 1 || criancas !== 0) {
    trace(
      `  ATENÇÃO: ocupação ${adultos} adulto(s)/${criancas} criança(s) pedida, mas o mapeamento dos campos internos de ocupação ainda não é conhecido — enviando a configuração atual do formulário`,
    );
  }
  trace(`  payload origem=${nomeOrigem} destino=${nomeDestino} campos=${[...p.keys()].length}`);

  trace(`POST pesquisa ${origem}->${destino} ${input.ida}`);
  const { res: resPesquisa, body } = await frtFetch(s, VENDA_URL, {
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

  const updatesDiag = extractPartialUpdates(body);
  const chavesDiag = Object.keys(updatesDiag);
  const precos = [...body.matchAll(/R\$\s?[\d.]+,\d{2}/g)].map((m) => m[0]).slice(0, 10);
  const semResultado =
    body.match(
      /(nenhum[\s\S]{0,60}?(resultado|disponibilidade|voo|pacote)[^<]{0,80})/i,
    )?.[1]?.replace(/\s+/g, " ").trim() ?? null;

  // PrimeFaces serializa o JSON da extension com entidades XML, por exemplo
  // {&#34;validationFailed&#34;:true}. A detecção deve ocorrer após decodificação.
  const bodyDecodificado = decodeEntities(body);
  const validationFailed = /"validationFailed"\s*:\s*true|validationFailed=["']?true/i.test(bodyDecodificado);
  const pnl = extrairPnlResultado(updatesDiag, body);
  const qtdPrecos = [...body.matchAll(/R\$\s?[\d.]+,\d{2}/g)].length;

  ultimaAmostraPesquisa = {
    em: new Date().toISOString(),
    status: resPesquisa.status,
    bytes: body.length,
    updates: chavesDiag.map((id) => ({ id, bytes: updatesDiag[id]!.length })),
    temPnlResultado: pnl.presente,
    pnlResultadoBytes: pnl.bytes,
    temPrecos: precos.length > 0,
    qtdPrecos,
    amostraPrecos: precos,
    mensagemNenhumResultado: semResultado,
    validationFailed,
    inventario: ultimoInventarioMotor,
    autocomplete: [],
    payloadResolvido: { origem: nomeOrigem, destino: nomeDestino },
    raw: amostraSanitizada(body),
  };

  trace(`  POST pesquisa status: ${resPesquisa.status}`);
  trace(`  response size: ${body.length} bytes`);
  trace(
    `  updates: ${chavesDiag.length ? chavesDiag.map((k) => `${k}(${updatesDiag[k]!.length}b)`).join(", ") : "(nenhum)"}`,
  );
  trace(`  pnlResultado presente: ${pnl.presente} (${pnl.bytes} bytes de conteúdo)`);
  trace(`  ocorrências de preço: ${qtdPrecos}${precos.length ? ` -> ${precos.slice(0, 3).join(" | ")}` : ""}`);
  trace(`  mensagem "nenhum resultado": ${semResultado ?? "(nenhuma)"}`);
  trace(`  validationFailed: ${validationFailed}`);

  if (looksLikeSessionExpired(body)) throw new FrtError("FRT_SESSION_EXPIRED");

  if (validationFailed) {
    // A FRT recusou os parâmetros antes de pesquisar — pnlResultado vazio é
    // consequência disso, não ausência de disponibilidade.
    throw new FrtError(
      "FRT_SEARCH_VALIDATION_FAILED",
      "A FRT rejeitou os parâmetros da pesquisa (validationFailed:true)",
      `campos=${ultimoInventarioMotor?.campos.length ?? 0} updates=${chavesDiag.join(", ") || "(nenhum)"}`,
    );
  }

  const novoVs = extractViewState(body);
  if (novoVs) s.viewState = novoVs;

  const updates = updatesDiag;
  const chaves = chavesDiag;
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

  const out = parseResultadosHtml(html || Object.values(updates).join("\n"));

  // Classificação obrigatória antes de declarar sucesso vazio: só aceitamos
  // "pesquisa válida sem disponibilidade" com evidência explícita.
  if (!out.results.length) {
    const evidencia =
      Boolean(semResultado) || (pnl.presente && pnl.bytes >= 200 && qtdPrecos === 0);
    trace(
      `  classificação zero-resultados: evidencia=${evidencia} (mensagem=${Boolean(semResultado)} pnlBytes=${pnl.bytes} precos=${qtdPrecos})`,
    );
    if (!evidencia) {
      throw new FrtError(
        "FRT_SEARCH_INCONCLUSIVE",
        "A pesquisa não retornou resultados nem evidência de indisponibilidade — resposta inconclusiva",
        `pnlResultado=${pnl.presente} bytes=${pnl.bytes} precos=${qtdPrecos} updates=${chaves.join(", ") || "(nenhum)"}`,
      );
    }
  }

  return out;
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
export async function frtDiagnostico(reusarSessao = true) {
  try {
    const s = await getSession(!reusarSessao);
    const venda = await abrirVenda(s);
    const body = venda.body;
    const resolved = venda.estado === "ok" ? resolveSearchFields(body) : null;
    const acessoVenda = resumoAcesso(venda);
    const sessaoValida = venda.estado === "ok" || venda.estado === "shell";
    const autenticado = venda.estado === "ok";
    const erro =
      venda.estado === "ok"
        ? resolved && resolved.missing.length
          ? "FRT_STRUCTURE_CHANGED"
          : null
        : erroDoEstado(venda).code;
    return {
      ok: autenticado && (resolved?.missing.length ?? 0) === 0,
      autenticado,
      sessaoValida,
      acessoVenda,
      aguardandoCodigo: venda.aguardandoCodigo,
      viewStatePresente: Boolean(venda.viewState),
      cookies: [...s.cookies.keys()],
      campos: (resolved?.fields ?? null) as Record<string, string> | null,
      camposAusentes: resolved?.missing ?? [],
      camposAlterados: resolved?.changed ?? [],
      erro: erro as string | null,
      mensagem: (venda.estado === "ok" ? null : erroDoEstado(venda).message) as string | null,
      amostraHtml: frtUltimaAmostraHtml(),
      amostraPesquisa: frtUltimaAmostraPesquisa(),
      pendencia2fa: frtEstado2fa(),
      log: frtTraceLog().slice(-60),
    };
  } catch (e) {
    const err = e instanceof FrtError ? e : null;
    return {
      ok: false,
      autenticado: false,
      sessaoValida: false,
      acessoVenda: null as ResumoAcessoVenda | null,
      aguardandoCodigo: err?.code === "FRT_2FA_REQUIRED",
      viewStatePresente: false,
      cookies: [] as string[],
      campos: null as Record<string, string> | null,
      camposAusentes: [] as string[],
      camposAlterados: [] as string[],
      erro: (err?.code ?? "FRT_NETWORK_ERROR") as string | null,
      mensagem: (err?.message ?? "Falha ao conectar na FRT") as string | null,
      amostraHtml: frtUltimaAmostraHtml(),
      amostraPesquisa: frtUltimaAmostraPesquisa(),
      pendencia2fa: frtEstado2fa(),
      log: frtTraceLog().slice(-60),
    };
  }
}

/** Diagnóstico do POST de pesquisa: resposta bruta sanitizada + inventário de updates. */
export async function frtDiagnosticoPesquisa(input: FrtSearchInput) {
  const resultado = await consultarFRT(input);
  return {
    resultado,
    amostraPesquisa: frtUltimaAmostraPesquisa(),
    log: frtTraceLog().slice(-60),
  };
}
