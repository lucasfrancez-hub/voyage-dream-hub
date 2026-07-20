/**
 * Ferramenta interna de teste: simula o envio de um alerta automático de
 * alteração de voo pra um número, com os mesmos botões interativos do fluxo real.
 * Não grava alerta no banco — só dispara a mensagem pra validar o comportamento.
 */
import { createServerFn } from "@tanstack/react-start";

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("55")) return digits;
  return `55${digits}`;
}

export const sendTestFlightAlert = createServerFn({ method: "POST" })
  .inputValidator((input: { phone: string; scenario?: "minor" | "major" | "cancelled" }) => input)
  .handler(async ({ data }) => {
    const phone = normalizePhone(data.phone);
    const scenario = data.scenario ?? "major";

    const { sendWhatsAppText } = await import("@/lib/whatsapp/send.server");
    const { sendWhatsAppButtons } = await import("@/lib/whatsapp/send-buttons.server");

    const nome = "Lucas";
    const voo = "LA3456";
    const localizador = "TEST99";
    const saidaAntes = "20/07/2026 14:30";
    const saidaDepois = "20/07/2026 18:45";
    const chegadaAntes = "20/07/2026 16:10";
    const chegadaDepois = "20/07/2026 20:25";

    let body: string;
    let buttons: Array<{ id: string; title: string }>;

    if (scenario === "cancelled") {
      body =
        `Olá, ${nome}! 👋\n\n` +
        `*Recebemos a informação de que o seu voo ${voo} foi cancelado pela companhia aérea.*\n\n` +
        `🎫 *Localizador: ${localizador}*\n\n` +
        `❌ *Voo cancelado*: ${voo}\n` +
        `📅 *Data*: 20/07/2026\n` +
        `🛫 *Origem*: São Paulo (GRU)\n` +
        `🛬 *Destino*: Rio de Janeiro (GIG)\n\n` +
        `Escolha uma das opções abaixo:\n\n` +
        `✈️ Remarcar voo\n💰 Solicitar reembolso\n\n` +
        `_Equipe VIA AIR ✈️💛_`;
      buttons = [
        { id: "flight_alert:TEST-CANCEL:reschedule", title: "Remarcar voo" },
        { id: "flight_alert:TEST-CANCEL:refund", title: "Solicitar reembolso" },
      ];
    } else if (scenario === "minor") {
      body =
        `Olá, ${nome}! 👋\n\n` +
        `*Informamos uma atualização no seu voo ${voo}.*\n\n` +
        `🎫 *Localizador*: ${localizador}\n\n` +
        `🕓 *Horário de saída*\n• *Anterior*: ${saidaAntes}\n• *Atual*: 20/07/2026 14:45\n\n` +
        `🛬 *Horário de chegada*\n• *Anterior*: ${chegadaAntes}\n• *Atual*: 20/07/2026 16:25\n\n` +
        `ℹ️ _Esta alteração foi inferior a 30 minutos. Sua reserva permanece confirmada._\n\n` +
        `- _Equipe VIA AIR_`;
      buttons = [{ id: "flight_alert:TEST-MINOR:ack", title: "Ok, ciente" }];
    } else {
      body =
        `Olá, ${nome}! 👋\n\n` +
        `*Informamos uma atualização no seu voo ${voo}.*\n\n` +
        `🎫 *Localizador*: ${localizador}\n\n` +
        `🕓 *Horário de saída*\n• *Anterior*: ${saidaAntes}\n• *Atual*: ${saidaDepois}\n\n` +
        `🛬 *Horário de chegada*\n• *Anterior*: ${chegadaAntes}\n• *Atual*: ${chegadaDepois}\n\n` +
        `⚠️ *Esta alteração foi superior a 30 minutos. Conforme a política da companhia, é possível solicitar alteração sem custo.*\n\n` +
        `- _Equipe VIA AIR_`;
      buttons = [
        { id: "flight_alert:TEST-MAJOR:reschedule", title: "Remarcar voo" },
        { id: "flight_alert:TEST-MAJOR:refund", title: "Solicitar reembolso" },
      ];
    }

    try {
      const sent = await sendWhatsAppButtons({ to: phone, body, buttons });
      return { ok: true, phone, scenario, id: sent.id };
    } catch (err) {
      // Fallback: se botões falharem, manda texto simples
      const sent = await sendWhatsAppText(phone, body);
      return { ok: true, phone, scenario, id: sent.id, fallback: "text" };
    }
  });
