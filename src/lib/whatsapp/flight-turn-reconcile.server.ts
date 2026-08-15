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
      .select("id, wa_phone, mode, ai_paused, ai_debounce_until, tags, protocolo_ativo_id, central_slug")
      .eq("id", raw.conversation_id)
      .maybeSingle();
    if (!conv) continue;

    // TRAVA DE PROTOCOLO: uma solicitação aérea só vale dentro do protocolo em
    // que nasceu. Pedidos "ativos" de protocolos ENCERRADOS ficavam sendo
    // reexecutados contra as mensagens do atendimento ATUAL — o watchdog via
    // "cliente falou e ninguém respondeu", estourava as tentativas de um
    // pedido velho e disparava a transferência por instabilidade no protocolo
    // novo, matando o atendimento antes do especialista falar. Pedido órfão é
    // encerrado, nunca escalado.
    const protocoloAtivo = (conv as { protocolo_ativo_id?: string | null }).protocolo_ativo_id ?? null;
    if (!raw.protocol_id || raw.protocol_id !== protocoloAtivo) {
      await supabaseAdmin
        .from("wa_flight_search_requests")
        .update({ status: "cancelled" } as never)
        .eq("id", raw.id);
      await logProtocolEvent("flight_request_orphan_closed", {
        conversation_id: raw.conversation_id,
        protocolo_id: raw.protocol_id,
        search_request_id: raw.id,
        protocolo_ativo_id: protocoloAtivo,
      });
      continue;
    }

    // Atendimento humano já assumiu → o robô não interfere.
    if (conv.mode !== "ai" || (conv as { ai_paused?: boolean }).ai_paused) continue;

    // Última mensagem do cliente x última resposta nossa — SEMPRE dentro do
    // protocolo atual (mensagens de protocolos anteriores não contam).
    const { data: msgs } = await supabaseAdmin
      .from("wa_messages")
      .select("id, direction, sender, content, created_at")
      .eq("conversation_id", raw.conversation_id)
      .eq("protocolo_id", raw.protocol_id)
      .order("created_at", { ascending: false })
      .limit(20);

    const lastIn = (msgs ?? []).find((m) => m.direction === "inbound");
    // AVISO DE TRANSFERÊNCIA NÃO É RESPOSTA. O balão "já vou te transferir pro
    // setor aéreo" vem do agente ANTERIOR; se o especialista não falar nada
    // depois disso, o turno está travado — antes esse balão mascarava a falha
    // e o cliente ficava esperando indefinidamente.
    const central = (conv as { central_slug?: string | null }).central_slug ?? null;
    const ehAvisoDeTransferencia = (m: { sender?: string | null; content?: string | null }) =>
      /transfer|encaminh|pass(ar|ando)\s+(voc[êe]|vc)/i.test(String(m.content ?? "")) &&
      (!central || (m.sender ?? "") !== central);
    const lastOut = (msgs ?? []).find(
      (m) => m.direction === "outbound" && m.sender !== "system" && !ehAvisoDeTransferencia(m),
    );
    if (!lastIn) continue;
    const respondido = lastOut && new Date(lastOut.created_at) > new Date(lastIn.created_at);
    if (respondido) continue;


    const parado = Date.now() - new Date(lastIn.created_at).getTime();
    if (parado < RETRY_MS) continue;

    if (parado < ESCALATE_MS) {
      // Um `ai_debounce_until` no futuro significa que já existe run agendado
      // (debounce normal), lease de execução em andamento (5 min) ou espera
      // humana de transferência (1min30–3min). Sobrescrever esse horário
      // causava dois runs simultâneos para a mesma mensagem — daí o
      // especialista entrando 1s depois do aviso de transferência e as
      // perguntas repetidas ("de qual cidade vc pretende embarcar?").
      // Turno realmente travado = nada agendado.
      if (conv.ai_debounce_until) continue;

      // Proibido loop: cada reexecução conta. Estourou o limite → válvula de
      // segurança (transferência automática por instabilidade).
      const { registrarTentativaRecuperacao, transferirPorInstabilidade } = await import(
        "./transferencia-instabilidade.server"
      );
      const { esgotou } = await registrarTentativaRecuperacao(raw);
      if (esgotou) {
        // TRANSFERÊNCIA PRO SETOR AÉREO NÃO PODE FALHAR: se o especialista
        // ainda nem falou neste protocolo, o cliente não pode receber
        // "instabilidade + time Comercial". Mandamos a pergunta de embarque
        // (determinística) e devolvemos o turno ao especialista.
        const especialistaJaFalou = (msgs ?? []).some(
          (m) => m.direction === "outbound" && central && m.sender === central,
        );
        if (!especialistaJaFalou && conv.wa_phone) {
          const [{ sendWhatsAppBubbles }, { safeMissingOriginResponse }] = await Promise.all([
            import("./send.server"),
            import("./airflow-guard"),
          ]);
          const texto = safeMissingOriginResponse(null, null, { semSaudacao: true });
          await sendWhatsAppBubbles(conv.wa_phone, texto, {
            conversation_id: raw.conversation_id,
            protocolo_id: raw.protocol_id,
            agent_slug: central,
          } as never);
          await supabaseAdmin
            .from("wa_flight_search_requests")
            .update({ recovery_attempts: 0, last_progress_at: new Date().toISOString() } as never)
            .eq("id", raw.id);
          await logProtocolEvent("flight_turn_recovered", {
            conversation_id: raw.conversation_id,
            protocolo_id: raw.protocol_id,
            search_request_id: raw.id,
            parado_ms: parado,
            resgate: "pergunta_origem_deterministica",
          });
          reexecutados.push(raw.id);
          continue;
        }
        await transferirPorInstabilidade({
          conversation_id: raw.conversation_id,
          protocol_id: raw.protocol_id,
          request: raw,
          motivo: "recuperacao_esgotada",
          detalhe: `turno parado há ${Math.round(parado / 60000)} min`,
        });
        escalados.push(raw.id);
        continue;
      }


      await supabaseAdmin
        .from("wa_conversations")
        .update({ ai_debounce_until: new Date().toISOString() })
        .eq("id", raw.conversation_id)
        .is("ai_debounce_until", null);


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

    // Nem a reexecução resolveu: válvula de segurança (uma mensagem só,
    // IA pausada, jobs cancelados, briefing completo pro Comercial).
    const { transferirPorInstabilidade } = await import("./transferencia-instabilidade.server");
    await transferirPorInstabilidade({
      conversation_id: raw.conversation_id,
      protocol_id: raw.protocol_id,
      request: raw,
      motivo: "reconciliador_falhou",
      detalhe: `sem resposta há ${Math.round(parado / 60000)} min`,
    });
    escalados.push(raw.id);
  }

  return { reexecutados, escalados };
}
