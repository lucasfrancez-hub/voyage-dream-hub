/**
 * OnerSessionManager — sessão da conta operacional VIA AIR na Comprar Viagem.
 *
 * Reaproveita a sessão válida, detecta expiração e só pede novo código de
 * acesso quando precisa. O token fica cifrado no banco e nunca vai a log.
 * SERVER-ONLY.
 */
import { ONER_ACCOUNT_EMAIL, ONER_API, ONER_AUTH_API, ONER_PROVIDER } from "./config";
import { onerFetch } from "./client.server";
import { cifrar, decifrar } from "./crypto.server";
import { abrirPedidoCodigo, aguardarCodigo, pedidoPendente } from "./otp.server";
import { registrarEvento } from "./store.server";

/** Sessões da Oner costumam durar horas; renovamos com folga. */
const VALIDADE_PADRAO_MS = 6 * 60 * 60_000;

export type SessaoOner = {
  id: string;
  account_email: string;
  status: string;
  authenticated_at: string;
  expires_at: string | null;
  last_used_at: string | null;
};

export type StatusConexao = {
  status: "conectada" | "codigo_necessario" | "expirada";
  accountEmail: string;
  authenticatedAt: string | null;
  lastUsedAt: string | null;
  expiresAt: string | null;
  otpPendenteDesde: string | null;
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Data/hora local com fuso, no formato que a Oner espera. */
export function dateTimeClient(now = new Date()): string {
  const off = -now.getTimezoneOffset();
  const sinal = off >= 0 ? "+" : "-";
  const abs = Math.abs(off);
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}` +
    `T${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}` +
    `${sinal}${p(Math.floor(abs / 60))}:${p(abs % 60)}`
  );
}

async function sessaoAtiva() {
  const db = await admin();
  const { data } = await db
    .from("oner_sessions")
    .select("*")
    .eq("provider", ONER_PROVIDER)
    .eq("status", "active")
    .order("authenticated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as unknown as (SessaoOner & { token_encrypted: string }) | null) ?? null;
}

async function invalidarSessoes(motivo: string) {
  const db = await admin();
  await db
    .from("oner_sessions")
    .update({ status: "expired" } as never)
    .eq("provider", ONER_PROVIDER)
    .eq("status", "active");
  await registrarEvento({ eventType: "session_expired", message: `Sessão encerrada: ${motivo}` });
}

/** Confere se o token ainda é aceito pela Oner. */
export async function testarToken(token: string): Promise<boolean> {
  const r = await onerFetch(`${ONER_API}/api/order/v1/orders?page=1&pageSize=1`, { token });
  if (r.call.status === 401 || r.call.status === 403) return false;
  // Endpoint inexistente também não confirma nada: tratamos 404 como indefinido → válido.
  return r.call.status !== 0;
}

/** Situação da conexão para o painel. */
export async function statusConexao(): Promise<StatusConexao> {
  const sessao = await sessaoAtiva();
  const otp = await pedidoPendente();
  const expirada =
    !sessao || (sessao.expires_at ? new Date(sessao.expires_at).getTime() < Date.now() : false);
  return {
    status: otp ? "codigo_necessario" : expirada ? "expirada" : "conectada",
    accountEmail: sessao?.account_email ?? ONER_ACCOUNT_EMAIL,
    authenticatedAt: sessao?.authenticated_at ?? null,
    lastUsedAt: sessao?.last_used_at ?? null,
    expiresAt: sessao?.expires_at ?? null,
    otpPendenteDesde: otp?.requested_at ?? null,
  };
}

/** Solicita o código de acesso por e-mail e abre a tentativa de login. */
export async function solicitarCodigo(integrationOrderId?: string | null) {
  const email = ONER_ACCOUNT_EMAIL;
  const pedido = await abrirPedidoCodigo({ integrationOrderId: integrationOrderId ?? null });
  const r = await onerFetch<{ success?: boolean; message?: string }>(
    `${ONER_AUTH_API}/api/authenticate/send-code`,
    { method: "POST", body: { email, userCreationModeManual: false } },
  );
  const ok = Boolean(r.body?.success) && r.call.ok;
  await registrarEvento({
    integrationOrderId: integrationOrderId ?? null,
    eventType: "otp_send_code",
    message: ok ? "E-mail com código solicitado" : `Falha ao pedir código: ${r.call.message ?? ""}`,
    payload: { status: r.call.status },
  });
  return { ok, pedidoId: pedido.id, call: r.call };
}

/** Troca o código por um token e guarda a sessão cifrada. */
export async function validarCodigo(codigo: string): Promise<{ ok: boolean; erro?: string }> {
  const r = await onerFetch<{ success?: boolean; data?: { token?: string }; message?: string }>(
    `${ONER_AUTH_API}/api/authenticate/code`,
    {
      method: "POST",
      body: {
        email: ONER_ACCOUNT_EMAIL,
        authenticationCode: codigo,
        agentId: Number(process.env["ONER_AGENT_ID"] ?? 83956),
        dateTimeClient: dateTimeClient(),
      },
    },
  );
  const token = r.body?.data?.token ?? null;
  if (!token) {
    await registrarEvento({
      eventType: "session_auth_failed",
      message: `Login não concluído: ${r.call.message ?? r.call.status}`,
    });
    return { ok: false, erro: r.call.message ?? "código recusado" };
  }
  const db = await admin();
  await db
    .from("oner_sessions")
    .update({ status: "replaced" } as never)
    .eq("provider", ONER_PROVIDER)
    .eq("status", "active");
  await db.from("oner_sessions").insert({
    provider: ONER_PROVIDER,
    account_email: ONER_ACCOUNT_EMAIL,
    token_encrypted: cifrar(token),
    status: "active",
    authenticated_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + VALIDADE_PADRAO_MS).toISOString(),
    last_used_at: new Date().toISOString(),
  } as never);
  await registrarEvento({ eventType: "session_created", message: "Sessão Comprar Viagem autenticada" });
  return { ok: true };
}

/**
 * Devolve um token válido. Se não houver, faz o login inteiro:
 * pede o código, espera chegar (e-mail encaminhado ou digitado no painel)
 * e valida. Devolve null quando o código não chega a tempo.
 */
export async function obterToken(opts: {
  integrationOrderId?: string | null;
  esperarCodigoMs?: number;
  forcarNovo?: boolean;
} = {}): Promise<string | null> {
  if (!opts.forcarNovo) {
    const sessao = await sessaoAtiva();
    if (sessao) {
      const vencida = sessao.expires_at ? new Date(sessao.expires_at).getTime() < Date.now() : false;
      if (!vencida) {
        const token = decifrar(sessao.token_encrypted);
        if (await testarToken(token)) {
          const db = await admin();
          await db
            .from("oner_sessions")
            .update({ last_used_at: new Date().toISOString() } as never)
            .eq("id", sessao.id);
          return token;
        }
      }
      await invalidarSessoes("token recusado pelo fornecedor");
    }
  }

  const pedido = await solicitarCodigo(opts.integrationOrderId ?? null);
  if (!pedido.ok) return null;
  const codigo = await aguardarCodigo(pedido.pedidoId, opts.esperarCodigoMs ?? 3 * 60_000);
  if (!codigo) {
    await registrarEvento({
      integrationOrderId: opts.integrationOrderId ?? null,
      eventType: "otp_timeout",
      message: "Código de acesso não chegou a tempo",
    });
    return null;
  }
  const r = await validarCodigo(codigo);
  if (!r.ok) return null;
  const sessao = await sessaoAtiva();
  return sessao ? decifrar(sessao.token_encrypted) : null;
}

/** Token da sessão atual, sem tentar autenticar. */
export async function tokenAtual(): Promise<string | null> {
  const sessao = await sessaoAtiva();
  if (!sessao) return null;
  if (sessao.expires_at && new Date(sessao.expires_at).getTime() < Date.now()) return null;
  return decifrar(sessao.token_encrypted);
}
