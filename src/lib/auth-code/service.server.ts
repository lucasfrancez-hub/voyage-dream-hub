/**
 * Serviço de códigos de autenticação (2FA/OTP) por e-mail.
 *
 * Fluxo: automação abre uma tentativa → o fornecedor envia o código →
 * o e-mail é encaminhado para encaminhamentoviaair@gmail.com → aqui a caixa
 * é consultada em intervalos curtos até achar o código daquela tentativa.
 *
 * Regras de segurança respeitadas neste módulo:
 *  - o código NUNCA aparece em log nem é gravado no banco (só os 2 últimos
 *    dígitos, mascarados);
 *  - a caixa inteira nunca é exposta: só metadados do e-mail identificado;
 *  - códigos anteriores ao início da tentativa são ignorados;
 *  - uma mensagem já consumida por outra tentativa não é reutilizada.
 */
import { acharProvedor, normalizarTexto, type ProvedorCodigo } from "./providers";
import { combinaComProvedor, extrairCodigo, mascararCodigo, pareceAutenticacao } from "./extract";
import { mensagensRecentes, contaConectada, type MensagemGmail } from "./gmail.server";

export const ESPERA_PADRAO_MS = 120_000;
const INTERVALO_MS = 2_500;
/** Tolerância para relógio/atraso do encaminhamento. */
const FOLGA_MS = 45_000;
/** Priorizamos mensagens dos últimos 5 minutos. */
export const JANELA_PRIORIDADE_MS = 5 * 60_000;

export type StatusTentativa =
  | "aguardando_codigo"
  | "codigo_encontrado"
  | "codigo_utilizado"
  | "expirado"
  | "erro";

export type ResultadoEspera =
  | {
      success: true;
      authAttemptId: string;
      messageId: string;
      receivedAt: string;
      sender: string;
      subject: string;
      code: string;
      codeMask: string;
    }
  | { success: false; authAttemptId: string; error: string };

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function ident(id: string) {
  return id.slice(0, 8);
}

/** Abre uma tentativa e devolve o `auth_attempt_id`. */
export async function iniciarTentativa(input: {
  provider: string;
  loginHint?: string | null;
  requestedAt?: string | null;
  createdBy?: string | null;
}): Promise<{ authAttemptId: string; provedor: ProvedorCodigo; requestedAt: string }> {
  const provedor = acharProvedor(input.provider);
  const requestedAt = input.requestedAt ? new Date(input.requestedAt) : new Date();
  const db = await admin();
  const { data, error } = await db
    .from("auth_code_attempts")
    .insert({
      provider: provedor.id,
      login_hint: input.loginHint ?? null,
      requested_at: requestedAt.toISOString(),
      status: "aguardando_codigo",
      expected_senders: provedor.dominios,
      expected_subjects: provedor.assuntos ?? [],
      created_by: input.createdBy ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const authAttemptId = data.id as string;
  console.log(`[2FA] tentativa ${ident(authAttemptId)} aberta (${provedor.id})`);
  return { authAttemptId, provedor, requestedAt: requestedAt.toISOString() };
}

async function marcar(
  id: string,
  patch: Record<string, unknown>,
) {
  const db = await admin();
  await db.from("auth_code_attempts").update(patch).eq("id", id);
}

/** Mensagens já consumidas por outra tentativa (evita duplicidade). */
async function idsJaUsados(desde: string): Promise<Set<string>> {
  const db = await admin();
  const { data } = await db
    .from("auth_code_attempts")
    .select("gmail_message_id")
    .not("gmail_message_id", "is", null)
    .gte("requested_at", new Date(new Date(desde).getTime() - 60 * 60_000).toISOString());
  return new Set((data ?? []).map((r) => r.gmail_message_id as string));
}

function assuntoBate(provedor: ProvedorCodigo, assunto: string): boolean {
  if (!provedor.assuntos?.length) return true;
  const a = normalizarTexto(assunto);
  return provedor.assuntos.some((s) => a.includes(normalizarTexto(s)));
}

/** Escolhe, entre as mensagens da janela, a melhor para esta tentativa. */
export function escolherMensagem(
  mensagens: MensagemGmail[],
  provedor: ProvedorCodigo,
  desdeMs: number,
  usados: Set<string>,
): { mensagem: MensagemGmail; codigo: string } | null {
  const candidatas = mensagens
    .filter((m) => m.recebidoEm >= desdeMs && !usados.has(m.id))
    .sort((a, b) => b.recebidoEm - a.recebidoEm);

  const avaliadas: Array<{ mensagem: MensagemGmail; codigo: string; peso: number }> = [];
  for (const m of candidatas) {
    const texto = `${m.assunto}\n${m.corpo}`;
    if (!pareceAutenticacao(texto)) continue;
    if (!combinaComProvedor(provedor, m)) continue;
    const codigo = extrairCodigo(texto, provedor);
    if (!codigo) continue;
    let peso = 0;
    if (assuntoBate(provedor, m.assunto)) peso += 2;
    if (Date.now() - m.recebidoEm <= JANELA_PRIORIDADE_MS) peso += 3;
    avaliadas.push({ mensagem: m, codigo, peso });
  }
  if (!avaliadas.length) return null;
  // Mais recente primeiro; peso desempata entre horários próximos.
  avaliadas.sort(
    (a, b) => b.peso - a.peso || b.mensagem.recebidoEm - a.mensagem.recebidoEm,
  );
  const melhor = avaliadas[0]!;
  return { mensagem: melhor.mensagem, codigo: melhor.codigo };
}

/**
 * Consulta a caixa até achar o código da tentativa (ou estourar o tempo).
 * O código retornado é para uso EXCLUSIVO do backend.
 */
export async function aguardarCodigo(input: {
  authAttemptId: string;
  provider: string;
  requestedAt: string;
  timeoutMs?: number;
}): Promise<ResultadoEspera> {
  const provedor = acharProvedor(input.provider);
  const inicio = new Date(input.requestedAt).getTime() - FOLGA_MS;
  const limite = Date.now() + Math.min(Math.max(input.timeoutMs ?? ESPERA_PADRAO_MS, 5_000), 300_000);
  const id = input.authAttemptId;

  try {
    const usados = await idsJaUsados(input.requestedAt);
    usados.delete("");
    while (Date.now() < limite) {
      const mensagens = await mensagensRecentes(inicio);
      const achado = escolherMensagem(mensagens, provedor, inicio, usados);
      if (achado) {
        const recebidoEm = new Date(achado.mensagem.recebidoEm).toISOString();
        await marcar(id, {
          status: "codigo_utilizado",
          gmail_message_id: achado.mensagem.id,
          sender: (achado.mensagem.remetenteOriginal || achado.mensagem.remetente).slice(0, 200),
          subject: achado.mensagem.assunto.slice(0, 300),
          received_at: recebidoEm,
          code_mask: mascararCodigo(achado.codigo),
          code_used_at: new Date().toISOString(),
        });
        console.log(`[2FA] Código OTP encontrado para tentativa ${ident(id)}`);
        return {
          success: true,
          authAttemptId: id,
          messageId: achado.mensagem.id,
          receivedAt: recebidoEm,
          sender: achado.mensagem.remetenteOriginal || achado.mensagem.remetente,
          subject: achado.mensagem.assunto,
          code: achado.codigo,
          codeMask: mascararCodigo(achado.codigo),
        };
      }
      await new Promise((r) => setTimeout(r, INTERVALO_MS));
    }
    await marcar(id, { status: "expirado", error: "timeout" });
    console.log(`[2FA] tentativa ${ident(id)} expirou sem código`);
    return {
      success: false,
      authAttemptId: id,
      error: "Código de autenticação não encontrado dentro do tempo limite.",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "falha desconhecida";
    await marcar(id, { status: "erro", error: msg.slice(0, 300) });
    console.log(`[2FA] tentativa ${ident(id)} falhou: ${msg.slice(0, 120)}`);
    return { success: false, authAttemptId: id, error: msg };
  }
}

/** Atalho: abre a tentativa e já aguarda o código. */
export async function obterCodigoAutenticacao(input: {
  provider: string;
  loginHint?: string | null;
  requestedAt?: string | null;
  timeoutMs?: number;
}): Promise<ResultadoEspera> {
  const t = await iniciarTentativa(input);
  return aguardarCodigo({
    authAttemptId: t.authAttemptId,
    provider: t.provedor.id,
    requestedAt: t.requestedAt,
    timeoutMs: input.timeoutMs ?? ESPERA_PADRAO_MS,
  });
}

export type Diagnostico = {
  conta: string;
  conectado: boolean;
  erro: string | null;
  ultimaSincronizacao: string;
  ultimaTentativa: {
    id: string;
    fornecedor: string;
    status: StatusTentativa;
    solicitadoEm: string;
    recebidoEm: string | null;
    remetente: string | null;
    assunto: string | null;
    codigoMascarado: string | null;
    erro: string | null;
  } | null;
};

/** Estado da integração para a tela administrativa (sem expor a caixa). */
export async function diagnosticoCaixa(): Promise<Diagnostico> {
  let conta = "encaminhamentoviaair@gmail.com";
  let conectado = false;
  let erro: string | null = null;
  try {
    conta = (await contaConectada()) || conta;
    conectado = true;
  } catch (e) {
    erro = e instanceof Error ? e.message : "falha ao consultar a caixa";
  }
  const db = await admin();
  const { data } = await db
    .from("auth_code_attempts")
    .select(
      "id, provider, status, requested_at, received_at, sender, subject, code_mask, error",
    )
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    conta,
    conectado,
    erro,
    ultimaSincronizacao: new Date().toISOString(),
    ultimaTentativa: data
      ? {
          id: data.id as string,
          fornecedor: acharProvedor(data.provider as string).nome,
          status: data.status as StatusTentativa,
          solicitadoEm: data.requested_at as string,
          recebidoEm: (data.received_at as string | null) ?? null,
          remetente: (data.sender as string | null) ?? null,
          assunto: (data.subject as string | null) ?? null,
          codigoMascarado: (data.code_mask as string | null) ?? null,
          erro: (data.error as string | null) ?? null,
        }
      : null,
  };
}
