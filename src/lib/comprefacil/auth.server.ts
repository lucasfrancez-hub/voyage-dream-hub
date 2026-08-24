/**
 * Autenticação no portal CompreFácil (GeniusWS / Phoenix.WebApp).
 *
 * O token é obtido com usuário e senha da agência (credenciais em segredo do
 * servidor) e vale ~12h. Guardamos em cache de processo e renovamos com folga.
 */

const BASE = "https://api.comprefacil.tur.br";
const CLIENT_ID = "portaloperadora:2026";
const FINGERPRINT = "viaair-servidor-01";

type Sessao = { token: string; expiraEm: number; agenciaId: string | null; usuarioId: string | null };

let sessao: Sessao | null = null;
let emAndamento: Promise<Sessao> | null = null;

function claims(token: string): Record<string, string> {
  try {
    const parte = token.split(".")[1];
    if (!parte) return {};
    const json = JSON.parse(Buffer.from(parte, "base64url").toString("utf8"));
    return Object.fromEntries(Object.entries(json).map(([k, v]) => [k, String(v)]));
  } catch {
    return {};
  }
}

/** Momento (epoch ms) até quando novos logins ficam bloqueados pela operadora. */
let bloqueadoAte = 0;

/** Traduz o erro do /token da CompreFácil para uma mensagem útil. */
function mensagemErroLogin(status: number, texto: string): string {
  let corpo: any = {};
  try {
    corpo = texto ? JSON.parse(texto) : {};
  } catch {
    corpo = {};
  }
  let detalhe: any = {};
  try {
    detalhe = corpo.error_description ? JSON.parse(corpo.error_description) : {};
  } catch {
    detalhe = { mensagem: corpo.error_description };
  }

  if (corpo.error === "otp_rate_limit") {
    const segundos = Number(detalhe.segundosRestantes) || 0;
    bloqueadoAte = Date.now() + segundos * 1000;
    const horas = Math.floor(segundos / 3600);
    const minutos = Math.round((segundos % 3600) / 60);
    const quando = horas > 0 ? `${horas}h${String(minutos).padStart(2, "0")}` : `${minutos} min`;
    return `A CompreFácil bloqueou o envio de novos códigos de verificação (limite atingido). Tente reconectar em ${quando}.`;
  }
  if (corpo.error === "invalid_grant" && !detalhe.segundosRestantes) {
    return detalhe.mensagem
      ? `CompreFácil recusou o login: ${detalhe.mensagem}`
      : "CompreFácil recusou o usuário ou a senha.";
  }
  return detalhe.mensagem
    ? `Falha ao autenticar no CompreFácil: ${detalhe.mensagem}`
    : `Falha ao autenticar no CompreFácil [${status}]`;
}

async function autenticar(): Promise<Sessao> {
  if (bloqueadoAte > Date.now()) {
    const minutos = Math.ceil((bloqueadoAte - Date.now()) / 60000);
    throw new Error(
      `A CompreFácil está com o envio de códigos bloqueado. Tente novamente em ~${minutos} min.`,
    );
  }

  const usuario = process.env["COMPREFACIL_USUARIO"];
  const senha = process.env["COMPREFACIL_SENHA"];
  if (!usuario || !senha) {
    throw new Error("Credenciais do CompreFácil não configuradas no servidor.");
  }

  const resp = await fetch(`${BASE}/token`, {
    method: "POST",
    headers: {
      // o /token é OAuth clássico: precisa ser form-urlencoded (com JSON a
      // operadora devolve 400 e ainda dispara código 2FA à toa)
      "Content-Type": "application/x-www-form-urlencoded",
      noauth: "t",
      fingerprint: FINGERPRINT,
      navegador: "Chrome",
    },
    body: new URLSearchParams({
      grant_type: "password",
      username: usuario,
      password: senha,
      client_id: CLIENT_ID,
    }).toString(),
  });

  const texto = await resp.text();
  if (!resp.ok && resp.status !== 202) {
    console.error(`CompreFácil login falhou [${resp.status}]: ${texto.slice(0, 300)}`);
    throw new Error(mensagemErroLogin(resp.status, texto));
  }

  // login aceito: some qualquer bloqueio anterior de códigos
  bloqueadoAte = 0;

  let dados: { access_token?: string; expires_in?: number };
  try {
    dados = JSON.parse(texto || "{}");
  } catch {
    throw new Error("Resposta inesperada do CompreFácil ao autenticar.");
  }

  // Só entra no fluxo de dois fatores quando a operadora NÃO devolveu token.
  // O código chega em nao-responda@frt.tur.br e é lido automaticamente.
  const otpToken = resp.headers.get("X-Auth-Otp-Token");
  if (!dados.access_token && otpToken) {
    const validado = await validarDoisFatores(otpToken);
    if (validado) dados = validado;
  }


  if (!dados.access_token) throw new Error("CompreFácil não devolveu token de acesso.");

  const c = claims(dados.access_token);
  return {
    token: dados.access_token,
    // renova 5 minutos antes de expirar
    expiraEm: Date.now() + Math.max(60, (dados.expires_in ?? 43199) - 300) * 1000,
    agenciaId: c["agency_id"] ?? null,
    usuarioId: c["sub"] ?? null,
  };
}

/**
 * Busca o código de dois fatores na caixa de encaminhamento e valida o acesso.
 * Remetente original: nao-responda@frt.tur.br.
 * Assunto: "Código de acesso ao sistema FRT Operadora - <usuário>".
 */
async function validarDoisFatores(otpToken: string): Promise<{ access_token?: string; expires_in?: number } | null> {
  const { obterCodigoAutenticacao } = await import("@/lib/auth-code/service.server");
  const espera = await obterCodigoAutenticacao({
    provider: "comprefacil",
    loginHint: process.env["COMPREFACIL_USUARIO"] ?? null,
    timeoutMs: 60_000,
  });

  if (!espera.success || !espera.code) {
    throw new Error("Não recebemos o código de dois fatores do CompreFácil a tempo.");
  }

  const resp = await fetch(`${BASE}/api/autenticacao/validaracesso`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      noauth: "t",
      fingerprint: FINGERPRINT,
      navegador: "Chrome",
    },
    body: JSON.stringify({ token: otpToken, codigo: espera.code }),
  });

  const texto = await resp.text();
  if (!resp.ok && resp.status !== 202) {
    console.error(`CompreFácil validaracesso [${resp.status}]: ${texto.slice(0, 200)}`);
    throw new Error(`Código de dois fatores do CompreFácil recusado [${resp.status}]`);
  }

  let corpo: any = {};
  try {
    corpo = texto ? JSON.parse(texto) : {};
  } catch {
    corpo = {};
  }

  const token: string | undefined =
    corpo.access_token ??
    corpo.AccessToken ??
    corpo.token ??
    resp.headers.get("X-Auth-Token") ??
    undefined;

  return token ? { access_token: token, expires_in: corpo.expires_in ?? corpo.ExpiresIn } : null;
}

async function lerSessaoSalva(): Promise<Sessao | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("comprefacil_sessions")
      .select("token, expira_em, agencia_id, usuario_id")
      .eq("id", "default")
      .maybeSingle();
    if (!data?.token) return null;
    const expiraEm = new Date(data.expira_em as string).getTime();
    if (!Number.isFinite(expiraEm) || expiraEm <= Date.now()) return null;
    return {
      token: data.token as string,
      expiraEm,
      agenciaId: (data.agencia_id as string | null) ?? null,
      usuarioId: (data.usuario_id as string | null) ?? null,
    };
  } catch (e) {
    console.error("[comprefacil] falha ao ler sessão salva:", e instanceof Error ? e.message : e);
    return null;
  }
}

async function salvarSessao(s: Sessao): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("comprefacil_sessions").upsert(
      {
        id: "default",
        token: s.token,
        expira_em: new Date(s.expiraEm).toISOString(),
        agencia_id: s.agenciaId,
        usuario_id: s.usuarioId,
        fingerprint: FINGERPRINT,
      },
      { onConflict: "id" },
    );
  } catch (e) {
    console.error("[comprefacil] falha ao salvar sessão:", e instanceof Error ? e.message : e);
  }
}

/** Invalida a sessão salva (usado quando a operadora devolve 401). */
export async function limparSessaoCompreFacil(): Promise<void> {
  sessao = null;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("comprefacil_sessions").delete().eq("id", "default");
  } catch {
    /* ignora */
  }
}

export async function sessaoCompreFacil(): Promise<Sessao> {
  if (sessao && sessao.expiraEm > Date.now()) return sessao;
  if (!emAndamento) {
    emAndamento = (async () => {
      // 1) sessão persistida (sobrevive a deploys e reinícios do servidor)
      const salva = await lerSessaoSalva();
      if (salva) {
        sessao = salva;
        return salva;
      }
      // 2) só então faz login (e eventual 2FA)
      const nova = await autenticar();
      sessao = nova;
      await salvarSessao(nova);
      return nova;
    })().finally(() => {
      emAndamento = null;
    });
  }
  return emAndamento;
}

/**
 * Renovação proativa: o token da CompreFácil dura ~12h. Este helper é chamado
 * por cron e refaz o login quando falta menos que `margemMinutos` para expirar
 * (ou quando não há sessão), evitando que uma busca do cliente pegue token
 * vencido e tenha que esperar relogin/2FA.
 */
export async function renovarSessaoCompreFacil(
  margemMinutos = 60,
): Promise<{ renovou: boolean; expiraEm: string | null; motivo: string }> {
  if (bloqueadoAte > Date.now()) {
    return { renovou: false, expiraEm: null, motivo: "bloqueado" };
  }
  const atual = sessao && sessao.expiraEm > Date.now() ? sessao : await lerSessaoSalva();
  const limite = Date.now() + margemMinutos * 60 * 1000;
  if (atual && atual.expiraEm > limite) {
    sessao = atual;
    return { renovou: false, expiraEm: new Date(atual.expiraEm).toISOString(), motivo: "ainda_valida" };
  }
  await limparSessaoCompreFacil();
  const nova = await sessaoCompreFacil();
  return {
    renovou: true,
    expiraEm: new Date(nova.expiraEm).toISOString(),
    motivo: atual ? "perto_de_expirar" : "sem_sessao",
  };
}

/** Chamada autenticada na API do CompreFácil. `path` começa com "/". */
export async function chamarCompreFacil(
  path: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string>; base?: string } = {},
  tentativa = 0,
): Promise<{ status: number; ok: boolean; dados: unknown }> {
  const { token } = await sessaoCompreFacil();
  const url = `${init.base ?? BASE}${path}`;
  const resp = await fetch(url, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      fingerprint: FINGERPRINT,
      ...(init.headers ?? {}),
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });

  const texto = await resp.text();
  let dados: unknown = texto;
  try {
    dados = texto ? JSON.parse(texto) : null;
  } catch {
    /* mantém texto cru */
  }
  if ((resp.status === 401 || resp.status === 403) && tentativa === 0) {
    // token salvo expirou/foi revogado: descarta e refaz o login uma única vez
    await limparSessaoCompreFacil();
    return chamarCompreFacil(path, init, 1);
  }
  if (!resp.ok) {
    console.error(`CompreFácil ${path} [${resp.status}]: ${texto.slice(0, 300)}`);
  }
  return { status: resp.status, ok: resp.ok, dados };
}

export const COMPREFACIL_BASES = {
  principal: BASE,
  aereo: "https://apiaereo.comprefacil.tur.br",
  hotel: "https://apihotel.comprefacil.tur.br",
  servico: "https://apiservico.comprefacil.tur.br",
} as const;

/** Estado da sessão sem tentar logar (para a UI de conexão). */
export async function statusSessaoCompreFacil(): Promise<{
  conectado: boolean;
  expiraEm: string | null;
  agenciaId: string | null;
  usuarioId: string | null;
  bloqueadoAte: string | null;
}> {
  const atual = sessao && sessao.expiraEm > Date.now() ? sessao : await lerSessaoSalva();
  if (atual) sessao = atual;
  return {
    conectado: Boolean(atual),
    expiraEm: atual ? new Date(atual.expiraEm).toISOString() : null,
    agenciaId: atual?.agenciaId ?? null,
    usuarioId: atual?.usuarioId ?? null,
    bloqueadoAte: bloqueadoAte > Date.now() ? new Date(bloqueadoAte).toISOString() : null,
  };
}


/** Força um novo login (descarta a sessão salva). Resolve o 2FA sozinho. */
export async function reconectarCompreFacil(): Promise<Sessao> {
  await limparSessaoCompreFacil();
  bloqueadoAte = 0; // reconexão é manual: sempre tenta de novo

  const nova = await autenticar();
  sessao = nova;
  await salvarSessao(nova);
  return nova;
}
