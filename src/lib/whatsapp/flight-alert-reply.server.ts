/**
 * Trata a resposta de botão do robô de alteração de voo.
 * SERVER-ONLY. A mensagem de acolhimento é gerada pela IA a partir do
 * histórico recente (a mensagem automática ficou registrada como `sender=system`),
 * pra soar empática e contextual — sem template robótico.
 *
 * "reschedule" / "refund" escalam pra atendimento humano (não IA).
 * "ack" apenas confirma o recebimento (alteração < 30 min).
 */
import { generateText, type ModelMessage } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendWhatsAppText } from "@/lib/whatsapp/send.server";
import { saveMessage, recordHandoff, loadHistory } from "@/lib/whatsapp/conversation.server";

async function generateContextualReply(input: {
  conversation_id: string;
  intent: "ack" | "reschedule" | "refund";
  firstName: string | null;
  flightNumber: string | null;
  locator: string | null;
  cancelled: boolean;
}): Promise<string> {
  const key = process.env.LOVABLE_API_KEY;
  const greet = input.firstName ? `Oi, ${input.firstName}!` : "Olá!";
  const locLine = input.locator ? ` Já localizei sua reserva pelo localizador *${input.locator}*.` : "";
  const fallback =
    input.intent === "ack"
      ? `${greet} Aqui é a Camila, consultora da VIA AIR. Recebi sua confirmação sobre a alteração do voo${input.flightNumber ? ` *${input.flightNumber}*` : ""} — como a mudança foi pequena, sua reserva segue confirmada e não é preciso fazer nada.\n\n_Camila · VIA AIR_`
      : `${greet} Aqui é a Camila, consultora da VIA AIR. Vi que seu voo${input.flightNumber ? ` *${input.flightNumber}*` : ""} teve ${input.cancelled ? "*cancelamento*" : "*alteração significativa*"} e você pediu *${input.intent === "refund" ? "reembolso" : "remarcação sem custo"}*.${locLine} Já estou transferindo pro nosso time operacional, que dá sequência por aqui em instantes.\n\n_Camila · VIA AIR_`;


  if (!key) return fallback;

  try {
    const history = await loadHistory(input.conversation_id, 10);
    const messages: ModelMessage[] = history.map((m) => ({
      role: m.sender === "customer" ? "user" : "assistant",
      content: m.content,
    }));

    const intentText =
      input.intent === "ack"
        ? "confirmou ciência de uma alteração pequena de voo (não gera direito a remarcação sem custo)"
        : input.intent === "refund"
          ? (input.cancelled ? "solicitou REEMBOLSO após o voo ser CANCELADO pela companhia" : "solicitou REEMBOLSO após alteração significativa de voo")
          : (input.cancelled ? "solicitou REMARCAÇÃO após o voo ser CANCELADO pela companhia" : "solicitou REMARCAÇÃO SEM CUSTO após alteração significativa de voo");

    const system =
      "Você é a Camila, consultora VIA AIR no WhatsApp. Escreva UMA única mensagem curta (3–5 linhas), em pt-BR, tom empático e humano, SEM emojis exagerados.\n\n" +
      "Contexto: o sistema acabou de enviar um aviso automático sobre alteração/cancelamento de voo ao cliente (marcado como [sistema · ...] no histórico). O cliente respondeu clicando num botão — a intenção dele já está clara. Você JÁ TEM em mãos: nome, voo e LOCALIZADOR da reserva (informados abaixo). O pedido está atrelado ao localizador no sistema; NÃO precisa pedir NADA.\n\n" +
      "REGRAS OBRIGATÓRIAS:\n" +
      "- PRIMEIRA linha OBRIGATÓRIA (mesmo que já tenha se apresentado antes no histórico — este é um NOVO assunto): cumprimente pelo primeiro nome + se apresente. Formato exato: 'Oi, <Nome>! Aqui é a Camila, consultora da VIA AIR.'\n" +
      "- SEGUNDA linha: demonstre que entendeu a situação específica (alteração ou cancelamento do voo).\n" +
      (input.intent === "ack"
        ? "- TERCEIRA linha: explique que, como a mudança foi pequena, a reserva segue confirmada e não é preciso fazer nada.\n"
        : "- TERCEIRA linha: confirme a solicitação específica dele (remarcação sem custo OU reembolso).\n" +
          "- QUARTA linha: diga que já localizou a reserva pelo localizador e está TRANSFERINDO pro nosso time operacional, que dá sequência por aqui em instantes.\n") +
      "- PROIBIDO pedir CPF, número de pedido, localizador, e-mail, data de nascimento ou QUALQUER dado do cliente — todas essas informações já estão com a gente.\n" +
      "- PROIBIDO inventar prazos, valores, nomes de consultor operacional ou detalhes.\n" +
      "- Finalize com '_Equipe VIA AIR_' em linha própria.";

    const user =
      `Cliente: ${input.firstName ?? "(sem nome)"}\n` +
      `Intenção: ${intentText}\n` +
      `Voo: ${input.flightNumber ?? "?"}\n` +
      `Localizador (já vinculado ao pedido no sistema): ${input.locator ?? "?"}\n` +
      `Gere a mensagem de resposta agora, seguindo as regras.`;

    const gateway = createLovableAiGatewayProvider(key);
    const { text } = await generateText({
      model: gateway("openai/gpt-5.5"),
      system,
      messages: [...messages, { role: "user", content: user }],
    });
    const clean = (text ?? "").trim();
    return clean || fallback;
  } catch (err) {
    console.warn("[flight-alert-reply] IA falhou, usando fallback:", err instanceof Error ? err.message : err);
    return fallback;
  }
}

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

  const cancelled = (alert?.new_status ?? "").toLowerCase().includes("cancel");

  // Ack = alteração informativa, não escala
  if (action === "ack") {
    const reply = await generateContextualReply({
      conversation_id: input.conversation_id,
      intent: "ack",
      firstName,
      flightNumber: alert?.flight_number ?? null,
      locator: orderRow?.airline_locator ?? null,
      cancelled,
    });
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

  const reply = await generateContextualReply({
    conversation_id: input.conversation_id,
    intent: action === "refund" ? "refund" : "reschedule",
    firstName,
    flightNumber: alert?.flight_number ?? null,
    locator: orderRow?.airline_locator ?? null,
    cancelled,
  });

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
