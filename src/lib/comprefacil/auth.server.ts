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

async function autenticar(): Promise<Sessao> {
  const usuario = process.env["COMPREFACIL_USUARIO"];
  const senha = process.env["COMPREFACIL_SENHA"];
  if (!usuario || !senha) {
    throw new Error("Credenciais do CompreFácil não configuradas no servidor.");
  }

  const resp = await fetch(`${BASE}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
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
    throw new Error(`Falha ao autenticar no CompreFácil [${resp.status}]`);
  }

  let dados: { access_token?: string; expires_in?: number };
  try {
    dados = JSON.parse(texto);
  } catch {
    throw new Error("Resposta inesperada do CompreFácil ao autenticar.");
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

export async function sessaoCompreFacil(): Promise<Sessao> {
  if (sessao && sessao.expiraEm > Date.now()) return sessao;
  if (!emAndamento) {
    emAndamento = autenticar()
      .then((s) => {
        sessao = s;
        return s;
      })
      .finally(() => {
        emAndamento = null;
      });
  }
  return emAndamento;
}

/** Chamada autenticada na API do CompreFácil. `path` começa com "/". */
export async function chamarCompreFacil(
  path: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string>; base?: string } = {},
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
