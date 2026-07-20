/**
 * Trata a resposta de botão do robô de alteração de voo.
 * SERVER-ONLY. Mensagens do robô (sem nome de atendente).
 *
 * "reschedule" / "refund" escalam pra atendimento humano (não IA).
 * "ack" apenas confirma o recebimento (alteração < 30 min).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendWhatsAppText } from "@/lib/whatsapp/send.server";
import { saveMessage, recordHandoff } from "@/lib/whatsapp/conversation.server";

export async function handleFlightAlertReply(input: {
  conversation_id: string;
  wa_phone: string;
  button_id: string; // "flight_alert:<alertId>:reschedule|refund|ack|accept|reject"
}): Promise<void> {
  const parts = input.button_id.split(":");
  const alertId = parts[1];
  const action = parts[2];
  if (!alertId || !action) return;

  // Busca alerta + nome do cliente pra usar nas mensagens/briefing
  const { data: alert } = await supabaseAdmin
    .from("flight_change_alerts")
    .select("id, order_id, flight_number, old_depart_at, new_depart_at, new_status, orders!inner(full_name, payer_full_name, airline_locator)")
    .eq("id", alertId)
    .maybeSingle();

  const orderRow = (alert as { orders?: { full_name?: string | null; payer_full_name?: string | null; airline_locator?: string | null } } | null)?.orders ?? null;
  const fullName = orderRow?.full_name ?? orderRow?.payer_full_name ?? null;
  const firstName = fullName ? fullName.trim().split(/\s+/)[0] : null;
  const greet = firstName ? `${firstName}` : "";

  const responseMap: Record<string, "accepted" | "rejected" | null> = {
    accept: "accepted",
    reject: "rejected",
    reschedule: "accepted",  // pediu remarcar = quer resolver
    refund: "rejected",       // pediu reembolso = recusou nova programação
    ack: null,
  };

  await supabaseAdmin
    .from("flight_change_alerts")
    .update({
      response: responseMap[action] ?? null,
      responded_at: new Date().toISOString(),
    })
    .eq("id", alertId);

  // Ack = alteração informativa, não escala
  if (action === "ack") {
    const reply =
      "✅ Recebemos sua confirmação. Obrigado!\n\n" +
      "Como essa alteração não gera direito a remarcação sem custo, seguimos apenas com o registro. " +
      "Se precisar de qualquer coisa, é só chamar aqui.";
    const sent = await sendWhatsAppText(input.wa_phone, reply);
    await saveMessage({
      conversation_id: input.conversation_id,
      direction: "outbound",
      sender: "system",
      content: reply,
      wa_message_id: sent.id,
      skip_protocolo: true,
    });
    return;
  }

  // Remarcar / Reembolso → escala pra HUMANO (nem passa pela IA)
  const label = action === "refund" ? "REEMBOLSO" : "REMARCAÇÃO";
  const briefing =
    `Cliente respondeu ao alerta automático de alteração de voo.\n` +
    `- Voo: ${alert?.flight_number ?? "?"}\n` +
    `- Partida original: ${alert?.old_depart_at ?? "?"}\n` +
    `- Nova partida: ${alert?.new_depart_at ?? "?"}\n` +
    `- Status: ${alert?.new_status ?? "alterado"}\n` +
    `- Solicitação do cliente: *${label} SEM CUSTO*\n` +
    (alert?.order_id ? `- Pedido: ${alert.order_id}\n` : "") +
    `Atender o cliente diretamente (não repassar pra IA).`;

  // Marca conversa como humano + urgente e salva no protocolo
  const { data: conv } = await supabaseAdmin
    .from("wa_conversations")
    .select("id, tags, protocolo_ativo_id")
    .eq("id", input.conversation_id)
    .maybeSingle();

  const nextTags = Array.from(new Set([...(conv?.tags ?? []), "alteracao_voo"]));
  await supabaseAdmin
    .from("wa_conversations")
    .update({
      mode: "human",
      priority: "urgent",
      tags: nextTags,
    })
    .eq("id", input.conversation_id);

  if (conv?.protocolo_ativo_id) {
    await supabaseAdmin
      .from("wa_protocolos")
      .update({ assunto_resumo: briefing })
      .eq("id", conv.protocolo_ativo_id);
  }

  await recordHandoff({
    conversation_id: input.conversation_id,
    from_mode: "ai",
    to_mode: "human",
    reason: "alteracao_voo",
    briefing,
  });

  const reply =
    action === "refund"
      ? "📩 Recebemos sua solicitação de *reembolso*.\n\nUm consultor da nossa equipe vai continuar o atendimento por aqui em instantes."
      : "📩 Recebemos sua solicitação de *remarcação sem custo*.\n\nUm consultor da nossa equipe vai continuar o atendimento por aqui em instantes.";

  const sent = await sendWhatsAppText(input.wa_phone, reply);

  await saveMessage({
    conversation_id: input.conversation_id,
    direction: "outbound",
    sender: "system",
    content: reply,
    wa_message_id: sent.id,
    skip_protocolo: true,
  });
}
