/**
 * RECONCILIADOR DAS COTAÇÕES AÉREAS (autocorreção).
 *
 * Não basta "tentar de novo": esta rotina olha o ESTADO gravado, descobre o
 * que faltou e executa o próximo passo. Roda a cada minuto pelo watchdog, é
 * independente do agente, do texto da conversa e de nova mensagem do cliente.
 *
 * O que ela conserta:
 * - claim órfão (worker morreu): limpa o claim e devolve a opção pra fila;
 * - card gerado e não enviado: reaproveita a arte do cache e reenvia (se ainda
 *   falhar, sai em texto);
 * - envio que saiu no WhatsApp mas não fechou no banco: reconcilia pelo
 *   provider_message_id, sem reenviar;
 * - rodada seguinte não agendada: cria o next_run_at e encadeia na hora;
 * - status/contador divergente: recalcula pelas opções realmente entregues;
 * - opção parada há mais de 2 min: recuperação forçada;
 * - cotação incompleta há mais de 5 min: despeja o restante em texto;
 * - tudo falhou de verdade: failed_final + encaminhamento ao Comercial.
 *
 * SERVER-ONLY.
 */
import {
  EMERGENCIA_MS,
  MAX_TENTATIVAS,
  detectarInconsistencias,
  ehTerminal,
  emEmergencia,
  expectedOptions,
  foiEntregue,
  quoteStatus,
  statusAposFalha,
  type Inconsistencia,
} from "./flight-delivery";
import { processNextFlightQuoteOption } from "./flight-delivery.server";

const log = (o: Record<string, unknown>) =>
  console.log(JSON.stringify({ ...o, at: new Date().toISOString() }));

const db = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin;

type QuoteLite = {
  id: string;
  conversation_id: string;
  protocolo_id: string | null;
  payload: unknown;
  created_at: string;
  cancelled_at: string | null;
  delivery_status: string | null;
  delivered_options_count: number | null;
  expected_options: number | null;
  next_run_at: string | null;
};

type OptLite = {
  id: string;
  quote_id: string;
  option_index: number;
  delivery_status: string;
  claim_id: string | null;
  claim_expires_at: string | null;
  next_run_at: string | null;
  last_attempt_at: string | null;
  provider_message_id: string | null;
  attempt_count: number;
};

const CAMPOS_OPCAO =
  "id, quote_id, option_index, delivery_status, claim_id, claim_expires_at, next_run_at, last_attempt_at, provider_message_id, attempt_count";

export type ReconcileResult = {
  cotacoes: number;
  inconsistencias: number;
  reparadas: number;
  entregues: number;
  escaladas: number;
};

/**
 * Varre as cotações incompletas e conserta cada uma. Idempotente: pode rodar
 * junto com o worker sem duplicar envio (a entrega continua protegida por
 * claim + fingerprint + quote_id/option_index).
 */
export async function reconcileFlightDeliveries(limite = 25): Promise<ReconcileResult> {
  const supabaseAdmin = await db();
  const desde = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const { data } = await supabaseAdmin
    .from("wa_flight_quotes")
    .select(
      "id, conversation_id, protocolo_id, payload, created_at, cancelled_at, delivery_status, delivered_options_count, expected_options, next_run_at",
    )
    .is("cancelled_at", null)
    .not("delivery_status", "in", "(completed,cancelled,failed)")
    .gte("created_at", desde)
    .order("created_at", { ascending: true })
    .limit(limite);

  const out: ReconcileResult = {
    cotacoes: 0,
    inconsistencias: 0,
    reparadas: 0,
    entregues: 0,
    escaladas: 0,
  };

  for (const q of (data ?? []) as QuoteLite[]) {
    out.cotacoes++;
    try {
      const r = await reconciliarCotacao(q);
      out.inconsistencias += r.inconsistencias;
      out.reparadas += r.reparadas;
      out.entregues += r.entregues;
      out.escaladas += r.escalada ? 1 : 0;
    } catch (e) {
      console.warn("[reconcile] cotação falhou:", q.id, (e as Error)?.message ?? e);
    }
  }

  log({ event: "flight_delivery_reconcile_sweep", ...out });
  return out;
}

async function reconciliarCotacao(quote: QuoteLite): Promise<{
  inconsistencias: number;
  reparadas: number;
  entregues: number;
  escalada: boolean;
}> {
  const supabaseAdmin = await db();
  const agora = Date.now();
  const total = (((quote.payload ?? {}) as { opcoes?: unknown[] }).opcoes ?? []).length;
  const expected = quote.expected_options ?? expectedOptions(total);

  const { data: linhasRaw } = await supabaseAdmin
    .from("wa_flight_quote_options")
    .select(CAMPOS_OPCAO)
    .eq("quote_id", quote.id)
    .lt("option_index", Math.max(expected, 1))
    .order("option_index", { ascending: true });
  const linhas = (linhasRaw ?? []) as OptLite[];

  // Sem linhas de estado ainda (cotação recém-salva): deixa o worker materializar.
  if (!linhas.length) {
    const r = await processNextFlightQuoteOption({ quote_id: quote.id });
    return { inconsistencias: 0, reparadas: 0, entregues: r.delivered, escalada: false };
  }

  const problemas = detectarInconsistencias(
    {
      created_at: quote.created_at,
      delivery_status: quote.delivery_status,
      delivered_options_count: quote.delivered_options_count,
      expected_options: expected,
      next_run_at: quote.next_run_at,
    },
    linhas,
    agora,
  );

  if (!problemas.length) {
    // Sem inconsistência: só empurra a fila normal (respeitando next_run_at).
    const r = await processNextFlightQuoteOption({ quote_id: quote.id });
    return { inconsistencias: 0, reparadas: 0, entregues: r.delivered, escalada: false };
  }

  log({
    event: "flight_delivery_inconsistency_detected",
    quote_id: quote.id,
    protocol_id: quote.protocolo_id,
    total: problemas.length,
    tipos: problemas.map((p) => p.tipo),
    detalhes: problemas,
  });
  log({
    event: "flight_delivery_auto_repair_started",
    quote_id: quote.id,
    protocol_id: quote.protocolo_id,
    inconsistencias: problemas.length,
  });

  let reparadas = 0;
  for (const p of problemas) {
    const linha = p.option_index === null ? null : linhas.find((l) => l.option_index === p.option_index) ?? null;
    const ok = await repararUma(quote, p, linha, linhas, expected);
    if (ok) reparadas++;
  }

  // Depois de consertar o estado, executa o próximo passo de verdade.
  const emergencia = emEmergencia(
    {
      created_at: quote.created_at,
      delivered_options_count: linhas.filter((l) => foiEntregue(l.delivery_status)).length,
      expected_options: expected,
    },
    agora,
  );
  const r = await processNextFlightQuoteOption({
    quote_id: quote.id,
    imediato: true,
  }).catch(() => ({ delivered: 0, completed: false }) as { delivered: number; completed: boolean });

  // Nada mais recuperável e ainda faltando opção → humano.
  const escalada = await talvezEscalar(quote, expected);

  log({
    event: "flight_delivery_auto_repair_completed",
    quote_id: quote.id,
    protocol_id: quote.protocolo_id,
    reparadas,
    entregues_agora: r.delivered,
    cotacao_completa: r.completed,
    emergencia,
    escalada,
  });

  return { inconsistencias: problemas.length, reparadas, entregues: r.delivered, escalada };
}

/* ───────────────────────────── reparos pontuais ─────────────────────────── */

async function repararUma(
  quote: QuoteLite,
  p: Inconsistencia,
  linha: OptLite | null,
  linhas: OptLite[],
  expected: number,
): Promise<boolean> {
  const supabaseAdmin = await db();
  const registrar = (evento: string, estado_novo: string | null, extra: Record<string, unknown> = {}) =>
    log({
      event: evento,
      quote_id: quote.id,
      protocol_id: quote.protocolo_id,
      option_index: p.option_index,
      estado_anterior: p.estado_anterior,
      estado_novo,
      motivo: p.motivo,
      tentativa: linha?.attempt_count ?? null,
      ...extra,
    });

  switch (p.tipo) {
    /* claim órfão: limpa e devolve pra fila */
    case "claim_orfao": {
      if (!linha) return false;
      const novo = linha.attempt_count >= MAX_TENTATIVAS ? statusAposFalha(linha.attempt_count) : "pending";
      await supabaseAdmin
        .from("wa_flight_quote_options")
        .update({
          delivery_status: novo,
          claim_id: null,
          claim_expires_at: null,
          next_run_at: null,
          last_error: `claim recuperado: ${p.motivo}`,
        } as never)
        .eq("id", linha.id);
      registrar("flight_delivery_claim_recovered", novo);
      return true;
    }

    /* card pronto que não chegou a ser enviado: reaproveita a arte do cache */
    case "card_gerado_nao_enviado": {
      if (!linha) return false;
      // O envio passa pelo worker, que é cache-first: a arte já renderizada é
      // reutilizada e, se o envio falhar de novo, sai em texto.
      await supabaseAdmin
        .from("wa_flight_quote_options")
        .update({
          delivery_status: "pending",
          claim_id: null,
          claim_expires_at: null,
          next_run_at: null,
          last_error: `card gerado sem envio: ${p.motivo}`,
        } as never)
        .eq("id", linha.id);
      registrar("flight_delivery_generated_card_reused", "pending", { reaproveita_cache: true });
      return true;
    }

    /* saiu no provedor mas o banco não fechou: reconcilia sem reenviar */
    case "envio_nao_reconciliado": {
      if (!linha) return false;
      const { data: msg } = await supabaseAdmin
        .from("wa_messages")
        .select("content, wa_message_id")
        .eq("conversation_id", quote.conversation_id)
        .eq("quote_id", quote.id)
        .eq("option_index", linha.option_index + 1)
        .eq("direction", "outbound")
        .limit(1);
      const conteudo = ((msg ?? [])[0] as { content?: string } | undefined)?.content ?? "";
      const formato = /\[\[media:image/i.test(conteudo) ? "delivered_card" : "delivered_text";
      await supabaseAdmin
        .from("wa_flight_quote_options")
        .update({
          delivery_status: formato,
          delivery_format: formato === "delivered_card" ? "card" : "text",
          delivered_at: new Date().toISOString(),
          claim_id: null,
          claim_expires_at: null,
          next_run_at: null,
        } as never)
        .eq("id", linha.id);
      registrar("flight_delivery_status_reconciled", formato, {
        provider_message_id: linha.provider_message_id,
        reenviado: false,
      });
      return true;
    }

    /* opção parada: recuperação forçada agora */
    case "opcao_parada": {
      if (!linha) return false;
      if (linha.attempt_count >= MAX_TENTATIVAS) {
        await supabaseAdmin
          .from("wa_flight_quote_options")
          .update({ delivery_status: "failed_final", next_run_at: null, claim_id: null } as never)
          .eq("id", linha.id);
        registrar("flight_delivery_auto_repair_failed", "failed_final");
        return true;
      }
      await supabaseAdmin
        .from("wa_flight_quote_options")
        .update({
          delivery_status: "retry_scheduled",
          claim_id: null,
          claim_expires_at: null,
          next_run_at: null,
        } as never)
        .eq("id", linha.id);
      registrar("flight_delivery_claim_recovered", "retry_scheduled", { recuperacao_forcada: true });
      return true;
    }

    /* faltou agendar a rodada seguinte */
    case "rodada_nao_agendada": {
      const quando = new Date().toISOString();
      await supabaseAdmin
        .from("wa_flight_quotes")
        .update({ next_run_at: quando })
        .eq("id", quote.id);
      registrar("flight_delivery_next_round_recreated", null, { next_run_at: quando });
      return true;
    }

    /* contador/status divergindo das opções reais */
    case "status_incorreto": {
      const entregues = linhas.filter((l) => foiEntregue(l.delivery_status)).length;
      const todasTerminais = linhas.every((l) => ehTerminal(l.delivery_status));
      const status = quoteStatus(entregues, expected, {
        allFinalFailed: todasTerminais && entregues < expected,
      });
      await supabaseAdmin
        .from("wa_flight_quotes")
        .update({
          delivered_options_count: entregues,
          expected_options: expected,
          delivery_status: status,
          cards_sent_at: status === "completed" ? new Date().toISOString() : null,
        })
        .eq("id", quote.id);
      registrar("flight_delivery_status_reconciled", status, { delivered_options_count: entregues });
      return true;
    }

    default:
      return false;
  }
}

/* ──────────────────────── saída segura: humano ──────────────────────────── */

/**
 * Última linha de defesa: quando nenhuma opção é mais recuperável (todas
 * failed_final) ou a cotação passou do prazo extremo sem entregar nada, o
 * atendimento vai pro Comercial com contexto. O cliente é avisado — nunca
 * fica esperando indefinidamente.
 */
async function talvezEscalar(quote: QuoteLite, expected: number): Promise<boolean> {
  const supabaseAdmin = await db();
  const { data: linhasRaw } = await supabaseAdmin
    .from("wa_flight_quote_options")
    .select(CAMPOS_OPCAO)
    .eq("quote_id", quote.id)
    .lt("option_index", Math.max(expected, 1));
  const linhas = (linhasRaw ?? []) as OptLite[];
  if (!linhas.length) return false;

  const entregues = linhas.filter((l) => foiEntregue(l.delivery_status)).length;
  if (entregues >= expected) return false;

  const semSaida = linhas.every((l) => ehTerminal(l.delivery_status));
  const estourouPrazo =
    Date.now() - new Date(quote.created_at).getTime() > 2 * EMERGENCIA_MS && entregues === 0;
  if (!semSaida && !estourouPrazo) return false;

  await supabaseAdmin
    .from("wa_flight_quotes")
    .update({ delivery_status: "failed", next_run_at: null })
    .eq("id", quote.id);

  const { data: conv } = await supabaseAdmin
    .from("wa_conversations")
    .select("id, wa_phone, tags, protocolo_ativo_id")
    .eq("id", quote.conversation_id)
    .maybeSingle();
  const c = conv as { wa_phone: string; tags: string[] | null; protocolo_ativo_id: string | null } | null;
  if (!c) return false;

  const { saveAndSendText } = await import("./conversation.server");
  await saveAndSendText(
    quote.conversation_id,
    c.wa_phone,
    "Deu uma travada aqui do nosso lado pra fechar essa cotação\n\nJá passei pro nosso time comercial e um consultor te manda os valores por aqui mesmo, em instantes",
  ).catch(() => {});

  const tags = Array.from(new Set([...(c.tags ?? []), "nova_cotacao", "aguardando_humano"]));
  await supabaseAdmin
    .from("wa_conversations")
    .update({ tags, priority: "high", assigned_to: null })
    .eq("id", quote.conversation_id);

  const briefing =
    "⚠️ Entrega da cotação aérea falhou mesmo após autocorreção (card e texto). Enviar as opções manualmente.";
  if (c.protocolo_ativo_id) {
    await supabaseAdmin
      .from("wa_protocolos")
      .update({ assunto_resumo: briefing })
      .eq("id", c.protocolo_ativo_id);
  }
  const { recordHandoff } = await import("./conversation.server");
  await recordHandoff({
    conversation_id: quote.conversation_id,
    from_mode: "ai",
    to_mode: "ai",
    reason: "aguardando_humano:falha_entrega_cotacao",
    briefing,
  }).catch(() => {});

  log({
    event: "flight_delivery_auto_repair_failed",
    quote_id: quote.id,
    protocol_id: quote.protocolo_id,
    estado_novo: "failed_final",
    motivo: semSaida ? "todas as opções failed_final" : "prazo extremo sem nenhuma entrega",
    escalado_humano: true,
  });
  return true;
}
