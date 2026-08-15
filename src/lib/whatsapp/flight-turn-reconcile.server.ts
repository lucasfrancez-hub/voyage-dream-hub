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
      // Proibido loop: cada reexecução conta. Estourou o limite → válvula de
      // segurança (transferência automática por instabilidade).
      const { registrarTentativaRecuperacao, transferirPorInstabilidade } = await import(
        "./transferencia-instabilidade.server"
      );
      const { esgotou } = await registrarTentativaRecuperacao(raw);
      if (esgotou) {
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

      // Reexecuta o turno APENAS quando não há nada agendado. Um
      // `ai_debounce_until` no futuro significa que já existe run agendado
      // (debounce normal), lease de execução em andamento (5 min) ou espera
      // humana de transferência (1min30–3min). Sobrescrever esse horário
      // causava dois runs simultâneos para a mesma mensagem — daí o
      // especialista entrando 1s depois do aviso de transferência e as
      // perguntas repetidas ("de qual cidade vc pretende embarcar?").
      if (!conv.ai_debounce_until) {
        await supabaseAdmin
          .from("wa_conversations")
          .update({ ai_debounce_until: new Date().toISOString() })
          .eq("id", raw.conversation_id)
          .is("ai_debounce_until", null);
      } else {
        // Já há execução/agenda ativa: não conta como tentativa de recuperação
        // nem força nada. O próximo tick reavalia.
        continue;
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
