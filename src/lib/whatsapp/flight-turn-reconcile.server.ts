/**
 * AUTOCORREÇÃO DE TURNO TRAVADO.
 *
 * Sintoma real em produção: o cliente responde, o agente errado assume, não
 * produz saída nenhuma e o atendimento morre em silêncio — o cliente cobra
 * ("?", "conseguiu?") e nada acontece.
 *
 * Aqui o estado é a fonte da verdade: para toda solicitação aérea ATIVA cuja
 * última mensagem do cliente ficou sem resposta, o turno é reexecutado. Se
 * mesmo assim continuar parado, o atendimento vai pra um humano COM contexto.
 *
 * SERVER-ONLY. Chamado pelo watchdog (1 em 1 min).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { logProtocolEvent } from "./protocol-runtime.server";
import { STATUS_ATIVOS, type FlightSearchRequest } from "./flight-request.server";

/** Sem resposta por mais que isso → reexecuta o turno. */
const RETRY_MS = 3 * 60_000;
/** Sem resposta por mais que isso → atendimento humano com contexto. */
const ESCALATE_MS = 12 * 60_000;

function resumoDaSolicitacao(r: FlightSearchRequest): string {
  const p: string[] = [];
  p.push(`✈️ Cotação aérea em andamento (retomar com o cliente)`);
  p.push(`📍 ${r.origin ?? "origem não informada"} → ${r.destination ?? "destino não informado"}`);
  if (r.departure_date) p.push(`📅 Ida ${r.departure_date}${r.return_date ? ` · Volta ${r.return_date}` : " (somente ida)"}`);
  if (r.adults != null)
    p.push(`👥 ${r.adults} adulto(s)${r.children ? ` + ${r.children} criança(s)` : ""}${r.infants ? ` + ${r.infants} bebê(s)` : ""}`);
  if (r.baggage_filter) p.push(`🧳 Cliente pediu bagagem despachada`);
  if (r.direct_flight_filter) p.push(`🛫 Só voo direto`);
  if (r.pending_question) p.push(`❓ Última pergunta feita: ${r.pending_question}`);
  if (r.customer_nudge_count) p.push(`⏳ Cliente cobrou retorno ${r.customer_nudge_count}x`);
  p.push(`⚠️ A IA não conseguiu concluir o turno — assumir manualmente.`);
  return p.join("\n");
}

export async function reconcilePendingAgentTurns(): Promise<{
  reexecutados: string[];
  escalados: string[];
}> {
  const reexecutados: string[] = [];
  const escalados: string[] = [];

  const { data: reqs } = await supabaseAdmin
    .from("wa_flight_search_requests")
    .select("*")
    .in("status", STATUS_ATIVOS)
    .order("last_progress_at", { ascending: true })
    .limit(30);

  for (const raw of (reqs ?? []) as FlightSearchRequest[]) {
    const { data: conv } = await supabaseAdmin
      .from("wa_conversations")
      .select("id, wa_phone, mode, ai_paused, ai_debounce_until, tags, protocolo_ativo_id")
      .eq("id", raw.conversation_id)
      .maybeSingle();
    if (!conv) continue;
    // Atendimento humano já assumiu → o robô não interfere.
    if (conv.mode !== "ai" || (conv as { ai_paused?: boolean }).ai_paused) continue;

    // Última mensagem do cliente x última resposta nossa.
    const { data: msgs } = await supabaseAdmin
      .from("wa_messages")
      .select("id, direction, sender, created_at")
      .eq("conversation_id", raw.conversation_id)
      .order("created_at", { ascending: false })
      .limit(20);
    const lastIn = (msgs ?? []).find((m) => m.direction === "inbound");
    const lastOut = (msgs ?? []).find((m) => m.direction === "outbound" && m.sender !== "system");
    if (!lastIn) continue;
    const respondido = lastOut && new Date(lastOut.created_at) > new Date(lastIn.created_at);
    if (respondido) continue;

    const parado = Date.now() - new Date(lastIn.created_at).getTime();
    if (parado < RETRY_MS) continue;

    if (parado < ESCALATE_MS) {
      // Reexecuta o turno: basta liberar o debounce — o dispatcher pega no
      // próximo tick e o runAgent já retoma pelo estado persistido.
      if (!conv.ai_debounce_until || new Date(conv.ai_debounce_until as string) > new Date()) {
        await supabaseAdmin
          .from("wa_conversations")
          .update({ ai_debounce_until: new Date().toISOString() })
          .eq("id", raw.conversation_id);
      }
      await supabaseAdmin
        .from("wa_flight_search_requests")
        .update({ recovery_priority: "high", recovery_started_at: new Date().toISOString() } as never)
        .eq("id", raw.id);
      await logProtocolEvent("flight_turn_recovered", {
        conversation_id: raw.conversation_id,
        protocolo_id: raw.protocol_id,
        search_request_id: raw.id,
        parado_ms: parado,
      });
      reexecutados.push(raw.id);
      continue;
    }

    // Nem a reexecução resolveu: humano assume COM o contexto completo.
    const briefing = resumoDaSolicitacao(raw);
    const { recordHandoff, saveAndSendText } = await import("./conversation.server");
    await saveAndSendText(
      raw.conversation_id,
      conv.wa_phone as string,
      "Desculpa a demora! Vou chamar um consultor aqui do time pra te atender agora mesmo, tá?",
    ).catch(() => {});

    const tags = Array.from(
      new Set([...(((conv as { tags?: string[] | null }).tags ?? []) as string[]), "aguardando_humano", "nova_cotacao"]),
    );
    await supabaseAdmin
      .from("wa_conversations")
      .update({ tags, priority: "high", ai_paused: true, assigned_to: null })
      .eq("id", raw.conversation_id);
    if (raw.protocol_id) {
      await supabaseAdmin
        .from("wa_protocolos")
        .update({ assunto_resumo: briefing })
        .eq("id", raw.protocol_id);
    }
    await recordHandoff({
      conversation_id: raw.conversation_id,
      from_mode: "ai",
      to_mode: "human",
      reason: "turno_travado:cotacao_aerea",
      briefing,
    }).catch(() => {});
    await supabaseAdmin
      .from("wa_flight_search_requests")
      .update({
        status: "transferred",
        failure_reason: "turno_travado",
        cancelled_at: new Date().toISOString(),
      } as never)
      .eq("id", raw.id);
    await logProtocolEvent("flight_turn_escalated", {
      conversation_id: raw.conversation_id,
      protocolo_id: raw.protocol_id,
      search_request_id: raw.id,
      parado_ms: parado,
    });
    escalados.push(raw.id);
  }

  return { reexecutados, escalados };
}
