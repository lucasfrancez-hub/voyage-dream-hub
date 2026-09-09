/**
 * Código de acesso da Comprar Viagem (OTP por e-mail).
 *
 * Regras de segurança:
 *  - só aceita mensagem do remetente no-reply@comprarviagem.com.br;
 *  - só aceita mensagem recebida DEPOIS do início da tentativa de login;
 *  - o código é guardado cifrado, usado uma única vez e nunca vai para log;
 *  - toda entrada precisa do segredo do endpoint.
 * SERVER-ONLY.
 */
import { ONER_ACCOUNT_EMAIL, ONER_PROVIDER } from "./config";
import { cifrar, decifrar, mascarar } from "./crypto.server";
import { registrarEvento } from "./store.server";

/** Janela de validade de uma tentativa de login. */
const VALIDADE_MS = 10 * 60_000;

const REMETENTES_OK = ["no-reply@comprarviagem.com.br", "comprarviagem.com.br", "onertravel.com"];

export type OtpRequest = {
  id: string;
  account_email: string;
  status: string;
  requested_at: string;
  expires_at: string;
  received_at: string | null;
  consumed_at: string | null;
  code_encrypted: string | null;
  source: string | null;
  integration_order_id: string | null;
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Extrai o código do corpo do e-mail: "Código de acesso: 123456". */
export function extrairCodigoOner(texto: string): string | null {
  const limpo = String(texto ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ");
  const semAcento = limpo.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const rotulos = ["codigo de acesso", "codigo de verificacao", "access code", "codigo"];
  for (const rotulo of rotulos) {
    const i = semAcento.indexOf(rotulo);
    if (i === -1) continue;
    const trecho = limpo.slice(i, i + rotulo.length + 60);
    const m = /(?:^|[^\d])(\d{6})(?!\d)/.exec(trecho);
    if (m) return m[1]!;
  }
  return null;
}

/** O e-mail veio mesmo da Comprar Viagem? */
export function remetenteConfere(remetente: string, corpo: string): boolean {
  const alvo = `${remetente}\n${corpo.slice(0, 4000)}`.toLowerCase();
  return REMETENTES_OK.some((d) => alvo.includes(d));
}

/** Abre uma tentativa de login aguardando código. */
export async function abrirPedidoCodigo(opts: {
  integrationOrderId?: string | null;
  accountEmail?: string;
} = {}): Promise<OtpRequest> {
  const db = await admin();
  // Encerra tentativas antigas ainda abertas.
  await db
    .from("oner_otp_requests")
    .update({ status: "expired" } as never)
    .eq("provider", ONER_PROVIDER)
    .eq("status", "waiting");

  const { data, error } = await db
    .from("oner_otp_requests")
    .insert({
      provider: ONER_PROVIDER,
      account_email: opts.accountEmail ?? ONER_ACCOUNT_EMAIL,
      status: "waiting",
      requested_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + VALIDADE_MS).toISOString(),
      integration_order_id: opts.integrationOrderId ?? null,
    } as never)
    .select("*")
    .single();
  if (error) throw new Error(`Não foi possível abrir o pedido de código: ${error.message}`);
  await registrarEvento({
    integrationOrderId: opts.integrationOrderId ?? null,
    eventType: "otp_requested",
    message: "Código de acesso solicitado ao fornecedor",
  });
  return data as unknown as OtpRequest;
}

/** Tentativa de login aberta e ainda dentro do prazo. */
export async function pedidoPendente(): Promise<OtpRequest | null> {
  const db = await admin();
  const { data } = await db
    .from("oner_otp_requests")
    .select("*")
    .eq("provider", ONER_PROVIDER)
    .eq("status", "waiting")
    .gte("expires_at", new Date().toISOString())
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as unknown as OtpRequest) ?? null;
}

export type EntradaOtp = {
  remetente: string;
  assunto?: string | null;
  corpo: string;
  recebidoEm?: string | null;
  messageId?: string | null;
  origem?: string;
};

/**
 * Registra um código recebido. Devolve o motivo quando recusa —
 * nunca devolve nem registra o código.
 */
export async function registrarCodigoRecebido(
  entrada: EntradaOtp,
): Promise<{ ok: boolean; motivo?: string }> {
  const texto = `${entrada.assunto ?? ""}\n${entrada.corpo}`;
  if (!remetenteConfere(entrada.remetente, texto)) return { ok: false, motivo: "remetente_invalido" };

  const pendente = await pedidoPendente();
  if (!pendente) return { ok: false, motivo: "sem_login_pendente" };

  const recebido = entrada.recebidoEm ? new Date(entrada.recebidoEm) : new Date();
  if (Number.isNaN(recebido.getTime())) return { ok: false, motivo: "data_invalida" };
  // Só aceita e-mail chegado depois do início da tentativa (tolerância de 2 min por relógio).
  if (recebido.getTime() < new Date(pendente.requested_at).getTime() - 120_000) {
    return { ok: false, motivo: "email_antigo" };
  }

  const codigo = extrairCodigoOner(texto);
  if (!codigo) return { ok: false, motivo: "codigo_nao_encontrado" };

  const db = await admin();
  if (entrada.messageId) {
    const { data: repetido } = await db
      .from("oner_otp_requests")
      .select("id")
      .eq("message_id", entrada.messageId)
      .maybeSingle();
    if (repetido) return { ok: false, motivo: "mensagem_repetida" };
  }

  await db
    .from("oner_otp_requests")
    .update({
      status: "received",
      received_at: new Date().toISOString(),
      code_encrypted: cifrar(codigo),
      source: entrada.origem ?? "email",
      sender: entrada.remetente.slice(0, 200),
      message_id: entrada.messageId ?? null,
    } as never)
    .eq("id", pendente.id);

  await registrarEvento({
    integrationOrderId: pendente.integration_order_id,
    eventType: "otp_received",
    message: `Código Oner recebido (${mascarar(codigo)}) e associado à tentativa ${pendente.id}`,
  });
  return { ok: true };
}

/** Informa o código manualmente pelo painel. */
export async function informarCodigoManual(codigo: string): Promise<{ ok: boolean; motivo?: string }> {
  const limpo = String(codigo ?? "").replace(/\D/g, "");
  if (limpo.length !== 6) return { ok: false, motivo: "codigo_invalido" };
  const pendente = await pedidoPendente();
  if (!pendente) return { ok: false, motivo: "sem_login_pendente" };
  const db = await admin();
  await db
    .from("oner_otp_requests")
    .update({
      status: "received",
      received_at: new Date().toISOString(),
      code_encrypted: cifrar(limpo),
      source: "manual",
    } as never)
    .eq("id", pendente.id);
  await registrarEvento({
    integrationOrderId: pendente.integration_order_id,
    eventType: "otp_received",
    message: "Código Oner informado manualmente pelo painel",
  });
  return { ok: true };
}

/**
 * Espera o código chegar (automático ou manual) e o consome — uso único.
 * Devolve null se estourar o tempo.
 */
export async function aguardarCodigo(
  pedidoId: string,
  timeoutMs = 3 * 60_000,
): Promise<string | null> {
  const db = await admin();
  const limite = Date.now() + timeoutMs;
  while (Date.now() < limite) {
    const { data } = await db
      .from("oner_otp_requests")
      .select("id, status, code_encrypted")
      .eq("id", pedidoId)
      .maybeSingle();
    const row = data as { status?: string; code_encrypted?: string | null } | null;
    if (row?.status === "received" && row.code_encrypted) {
      await db
        .from("oner_otp_requests")
        .update({ status: "consumed", consumed_at: new Date().toISOString(), code_encrypted: null } as never)
        .eq("id", pedidoId);
      return decifrar(row.code_encrypted);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  await db.from("oner_otp_requests").update({ status: "expired" } as never).eq("id", pedidoId);
  return null;
}
