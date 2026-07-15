/**
 * Trata a resposta de botão do robô de alteração de voo.
 * SERVER-ONLY. Não aciona IA (mensagem de robô, sem nome de atendente).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendWhatsAppText } from "@/lib/whatsapp/send.server";
import { saveMessage } from "@/lib/whatsapp/conversation.server";

export async function handleFlightAlertReply(input: {
  conversation_id: string;
  wa_phone: string;
  button_id: string; // "flight_alert:<alertId>:accept|reject|ack"
}): Promise<void> {
  const parts = input.button_id.split(":");
  const alertId = parts[1];
  const action = parts[2];
  if (!alertId || !action) return;

  const response = action === "accept" ? "accepted" : action === "reject" ? "rejected" : null;

  await supabaseAdmin
    .from("flight_change_alerts")
    .update({
      response,
      responded_at: new Date().toISOString(),
    })
    .eq("id", alertId);

  let reply: string;
  if (action === "accept") {
    reply =
      "✅ Alteração confirmada. Já registramos sua aceitação.\n\n" +
      "Se precisar de qualquer outra coisa, é só chamar aqui.";
  } else if (action === "reject") {
    reply =
      "📩 Recebemos sua resposta. Nossa equipe de pós-venda vai entrar em contato pra ver as opções com você.";
  } else {
    reply = "Obrigado pela confirmação. Nossa equipe já foi notificada.";
  }

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
