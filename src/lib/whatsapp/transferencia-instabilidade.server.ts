/**
 * VÁLVULA DE SEGURANÇA — TRANSFERÊNCIA AUTOMÁTICA POR INSTABILIDADE.
 *
 * A autocorreção resolve a maioria dos travamentos, mas nenhum sistema recupera
 * 100% dos cenários. Quando a recuperação não faz a pesquisa avançar dentro do
 * limite, é PROIBIDO ficar em loop de retry: o cliente é imediatamente passado
 * pro time Comercial, com o contexto todo preservado.
 *
 * Gatilhos: timeout de pesquisa, worker interrompido, Browserless indisponível,
 * erro interno de ferramenta, pesquisa sem progresso real, reconciliador que não
 * reconstruiu o turno, 2+ tentativas de recuperação sem sucesso, ou qualquer
 * situação em que a IA perceba que não conclui sozinha.
 *
 * Depois da mensagem única: ai_paused = true, retries/jobs/follow-ups/watchdogs
 * da solicitação cancelados, briefing completo pro Comercial.
 *
 * SERVER-ONLY.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { logProtocolEvent } from "./protocol-runtime.server";
import {
  STATUS_ATIVOS,
  loadActiveFlightRequest,
  type FlightSearchRequest,
} from "./flight-request.server";

/** Duas tentativas de recuperação sem sucesso e acabou: vai pro humano. */
export const MAX_RECOVERY_ATTEMPTS = 2;

export type MotivoInstabilidade =
  | "timeout_pesquisa"
  | "worker_interrompido"
  | "browserless_indisponivel"
  | "erro_interno_ferramenta"
  | "pesquisa_sem_progresso"
  | "reconciliador_falhou"
  | "recuperacao_esgotada"
  | "ia_nao_conclui";

const ROTULO: Record<MotivoInstabilidade, string> = {
  timeout_pesquisa: "timeout na pesquisa de tarifas",
  worker_interrompido: "processo de busca interrompido no meio",
  browserless_indisponivel: "motor de pesquisa (Browserless) indisponível",
  erro_interno_ferramenta: "erro interno da ferramenta de pesquisa",
  pesquisa_sem_progresso: "pesquisa sem progresso real",
  reconciliador_falhou: "reconciliador não conseguiu reconstruir o turno",
  recuperacao_esgotada: `${MAX_RECOVERY_ATTEMPTS} tentativas de recuperação sem sucesso`,
  ia_nao_conclui: "a IA identificou que não concluiria o atendimento automaticamente",
};

/**
 * Classifica um erro técnico bruto num motivo de instabilidade.
 * Usado por quem chama a pesquisa e só tem a exceção na mão.
 */
export function classificarFalha(erro: unknown): MotivoInstabilidade {
  const m = (erro instanceof Error ? erro.message : String(erro ?? "")).toLowerCase();
  if (/timeout|timed out|etimedout|deadline|abort/.test(m)) return "timeout_pesquisa";
  if (/browserless|chrome|playwright|puppeteer|browser/.test(m)) return "browserless_indisponivel";
  if (/socket|econnreset|worker|terminated|exceeded cpu|memory/.test(m)) return "worker_interrompido";
  return "erro_interno_ferramenta";
}

/**
 * Conta mais uma tentativa de recuperação daquela solicitação.
 * Retorna `esgotou = true` quando o limite foi atingido — nesse caso o chamador
 * deve transferir, e NÃO tentar de novo.
 */
export async function registrarTentativaRecuperacao(
  req: Pick<FlightSearchRequest, "id" | "recovery_attempts">,
): Promise<{ tentativas: number; esgotou: boolean }> {
  const tentativas = (req.recovery_attempts ?? 0) + 1;
  await supabaseAdmin
    .from("wa_flight_search_requests")
    .update({
      recovery_attempts: tentativas,
      last_recovery_at: new Date().toISOString(),
      recovery_priority: "high",
    } as never)
    .eq("id", req.id);
  return { tentativas, esgotou: tentativas >= MAX_RECOVERY_ATTEMPTS };
}

/** Briefing completo do que já foi coletado, pro consultor não começar do zero. */
export function montarBriefingTransferencia(params: {
  req: FlightSearchRequest | null;
  motivo: MotivoInstabilidade;
  detalhe?: string | null;
  pesquisasConcluidas?: number;
  pesquisasPendentes?: number;
}): string {
  const { req, motivo } = params;
  const l: string[] = [];
  l.push("🚨 TRANSFERÊNCIA AUTOMÁTICA POR INSTABILIDADE — assumir a cotação manualmente");
  l.push(`📍 Origem: ${req?.origin ?? "não informada"}`);
  l.push(`🎯 Destino: ${req?.destination ?? "não informado"}${req?.destination_airport ? ` (${req.destination_airport})` : ""}`);
  l.push(
    `📅 Datas: ${req?.departure_date ?? "não informada"}${
      req?.return_date ? ` → ${req.return_date}` : req?.trip_type === "oneway" ? " (somente ida)" : ""
    }`,
  );
  l.push(
    `👥 Passageiros: ${req?.adults ?? "?"} adulto(s)` +
      `${req?.children ? ` + ${req.children} criança(s)` : ""}` +
      `${req?.infants ? ` + ${req.infants} bebê(s)` : ""}`,
  );
  l.push(`🧳 Bagagem despachada: ${req?.baggage_filter ? "SIM (cliente pediu)" : "não solicitada"}`);

  const filtros: string[] = [];
  if (req?.direct_flight_filter) filtros.push("somente voo direto");
  if (req?.max_connections != null) filtros.push(`máx ${req.max_connections} conexão(ões)`);
  if (req?.included_airlines?.length) filtros.push(`companhias: ${req.included_airlines.join(", ")}`);
  if (req?.excluded_airlines?.length) filtros.push(`evitar: ${req.excluded_airlines.join(", ")}`);
  if (req?.departure_time_preference) filtros.push(`ida ${req.departure_time_preference}`);
  if (req?.return_time_preference) filtros.push(`volta ${req.return_time_preference}`);
  l.push(`🎚️ Filtros aplicados: ${filtros.length ? filtros.join(" · ") : "nenhum"}`);

  l.push(`✅ Pesquisas concluídas: ${params.pesquisasConcluidas ?? 0}`);
  l.push(`⏳ Pesquisas pendentes: ${params.pesquisasPendentes ?? 0}`);
  if (req?.pending_question) l.push(`❓ Última pergunta feita ao cliente: ${req.pending_question}`);
  if (req?.customer_nudge_count) l.push(`⏰ Cliente cobrou retorno ${req.customer_nudge_count}x`);
  if (req?.recovery_attempts) l.push(`🔁 Tentativas de recuperação: ${req.recovery_attempts}`);
  l.push(`⚙️ Motivo técnico: ${ROTULO[motivo]}${params.detalhe ? ` — ${params.detalhe.slice(0, 200)}` : ""}`);
  l.push("🤖 IA pausada neste protocolo. Retomar a conversa por aqui mesmo.");
  return l.join("\n");
}

function montarMensagem(nome: string | null): string {
  const voc = nome ? `${nome}, ` : "";
  return (
    `${voc}tive uma instabilidade durante essa pesquisa e não quero te deixar esperando\n\n` +
    `Já transferi seu atendimento pro nosso time Comercial, que continua essa cotação por aqui mesmo`
  );
}

/**
 * Saída segura. Idempotente por conversa: se a IA já foi pausada por
 * instabilidade, nada é reenviado (proibido loop).
 */
export async function transferirPorInstabilidade(params: {
  conversation_id: string;
  protocol_id?: string | null;
  request?: FlightSearchRequest | null;
  motivo: MotivoInstabilidade;
  detalhe?: string | null;
}): Promise<{ transferido: boolean; motivo?: string }> {
  const { conversation_id, motivo } = params;

  const { data: conv } = await supabaseAdmin
    .from("wa_conversations")
    .select("id, wa_phone, display_name, mode, ai_paused, tags, protocolo_ativo_id")
    .eq("id", conversation_id)
    .maybeSingle();
  if (!conv) return { transferido: false, motivo: "conversa_inexistente" };

  // Humano já está no comando (ou IA já pausada): não repete mensagem nenhuma.
  if (conv.mode !== "ai" || (conv as { ai_paused?: boolean }).ai_paused) {
    return { transferido: false, motivo: "ja_em_atendimento_humano" };
  }

  const protocolId = params.protocol_id ?? (conv.protocolo_ativo_id as string | null);
  const req = params.request ?? (await loadActiveFlightRequest(protocolId));

  // ENTREGA JÁ CONCLUÍDA: se as opções deste protocolo já saíram (inclusive em
  // texto + link), um erro posterior NÃO vira mensagem de instabilidade nem
  // transferência. O protocolo é a fronteira correta; uma janela de minutos
  // deixava o watchdog repetir o aviso ao mudar de assunto na mesma conversa.
  {
    let entreguesQuery = supabaseAdmin
      .from("wa_flight_quotes")
      .select("id")
      .eq("conversation_id", conversation_id)
      .eq("delivery_status", "completed");
    if (protocolId) entreguesQuery = entreguesQuery.eq("protocolo_id", protocolId);
    else entreguesQuery = entreguesQuery.gte(
      "created_at",
      new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    );
    const { data: entregues } = await entreguesQuery.limit(1);
    if ((entregues ?? []).length) {
      console.warn(
        JSON.stringify({
          event: "instabilidade_ignorada_cotacao_entregue",
          conversation_id,
          motivo,
          at: new Date().toISOString(),
        }),
      );
      return { transferido: false, motivo: "cotacao_ja_entregue" };
    }
  }

  // Já transferida antes por instabilidade → nada a fazer.
  if (req?.transferred_at) return { transferido: false, motivo: "ja_transferida" };

  // Quantas pesquisas concluíram / ficaram pendentes neste protocolo.
  let concluidas = 0;
  let pendentes = 0;
  if (protocolId) {
    const { data: reqs } = await supabaseAdmin
      .from("wa_flight_search_requests")
      .select("status")
      .eq("protocol_id", protocolId);
    for (const r of (reqs ?? []) as { status: string }[]) {
      if (r.status === "completed") concluidas++;
      else if (STATUS_ATIVOS.includes(r.status as never)) pendentes++;
    }
  }

  const briefing = montarBriefingTransferencia({
    req,
    motivo,
    detalhe: params.detalhe ?? null,
    pesquisasConcluidas: concluidas,
    pesquisasPendentes: pendentes,
  });

  const { recordHandoff, saveAndSendText } = await import("./conversation.server");
  const { firstName } = await import("./text-utils.server");

  // 1) UMA mensagem só.
  await saveAndSendText(
    conversation_id,
    conv.wa_phone as string,
    montarMensagem(firstName(conv.display_name as string | null)),
  ).catch(() => {});

  // 2) IA pausada neste protocolo + fila do atendimento humano.
  const tags = Array.from(
    new Set([...(((conv as { tags?: string[] | null }).tags ?? []) as string[]), "aguardando_humano", "instabilidade"]),
  );
  await supabaseAdmin
    .from("wa_conversations")
    .update({ tags, priority: "high", ai_paused: true, assigned_to: null, ai_debounce_until: null })
    .eq("id", conversation_id);

  // 3) Cancela retries, jobs, follow-ups e watchdogs da solicitação.
  await cancelarJobsDaConversa(conversation_id, protocolId, motivo);

  // 4) Contexto preservado + briefing pro Comercial.
  if (protocolId) {
    await supabaseAdmin
      .from("wa_protocolos")
      .update({ assunto_resumo: briefing })
      .eq("id", protocolId);
  }
  if (req) {
    await supabaseAdmin
      .from("wa_flight_search_requests")
      .update({
        status: "transferred",
        failure_reason: motivo,
        transfer_reason: motivo,
        transfer_briefing: briefing,
        transferred_at: new Date().toISOString(),
        cancelled_at: new Date().toISOString(),
        pending_question: null,
        next_action: null,
      } as never)
      .eq("id", req.id);
  }
  await recordHandoff({
    conversation_id,
    from_mode: "ai",
    to_mode: "human",
    reason: `instabilidade:${motivo}`,
    briefing,
  }).catch(() => {});
  await logProtocolEvent("transferencia_instabilidade", {
    conversation_id,
    protocolo_id: protocolId,
    search_request_id: req?.id ?? null,
    motivo,
    detalhe: params.detalhe ?? null,
    tentativas: req?.recovery_attempts ?? 0,
  });

  return { transferido: true };
}

/** Mata tudo que poderia continuar tentando sozinho depois da transferência. */
async function cancelarJobsDaConversa(
  conversationId: string,
  protocolId: string | null,
  motivo: string,
): Promise<void> {
  // Solicitações aéreas ativas do protocolo.
  if (protocolId) {
    await supabaseAdmin
      .from("wa_flight_search_requests")
      .update({
        status: "transferred",
        failure_reason: motivo,
        pending_question: null,
        next_action: null,
        cancelled_at: new Date().toISOString(),
      } as never)
      .eq("protocol_id", protocolId)
      .in("status", STATUS_ATIVOS);
  }

  // Cotações e opções ainda na fila de entrega (cards pendentes / claims).
  const { data: quotes } = await supabaseAdmin
    .from("wa_flight_quotes")
    .select("id")
    .eq("conversation_id", conversationId)
    .not("delivery_status", "in", "(completed,cancelled)");
  const ids = ((quotes ?? []) as { id: string }[]).map((q) => q.id);
  if (ids.length) {
    await supabaseAdmin
      .from("wa_flight_quote_options")
      .update({ delivery_status: "cancelled", last_error: `transferencia:${motivo}` })
      .in("quote_id", ids)
      .not("delivery_status", "in", "(delivered_card,delivered_text)");
    await supabaseAdmin
      .from("wa_flight_quotes")
      .update({ delivery_status: "cancelled", next_run_at: null })
      .in("id", ids);
  }
}
