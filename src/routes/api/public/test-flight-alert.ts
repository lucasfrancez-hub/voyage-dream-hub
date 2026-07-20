/**
 * Rota interna de teste: dispara um alerta simulado de alteração de voo pra um número.
 * Restrita a números explicitamente permitidos pra evitar abuso.
 */
import { createFileRoute } from "@tanstack/react-router";

const ALLOWED_PHONES = new Set(["5544999093642"]);

function normalizePhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  return d.startsWith("55") ? d : `55${d}`;
}

export const Route = createFileRoute("/api/public/test-flight-alert")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as {
          phone?: string;
          scenario?: "minor" | "major" | "cancelled";
        };
        if (!body.phone) return new Response("phone required", { status: 400 });
        const phone = normalizePhone(body.phone);
        if (!ALLOWED_PHONES.has(phone)) return new Response("phone not allowed", { status: 403 });

        const scenario = body.scenario ?? "major";
        const { sendWhatsAppText } = await import("@/lib/whatsapp/send.server");
        const { sendWhatsAppButtons } = await import("@/lib/whatsapp/send-buttons.server");

        const nome = "Lucas";
        const voo = "LA3456";
        const localizador = "TEST99";

        let text: string;
        let buttons: Array<{ id: string; title: string }>;

        if (scenario === "cancelled") {
          text =
            `Olá, ${nome}! 👋\n\n*Recebemos a informação de que o seu voo ${voo} foi cancelado pela companhia aérea.*\n\n` +
            `🎫 *Localizador: ${localizador}*\n\n❌ *Voo cancelado*: ${voo}\n📅 *Data*: 20/07/2026\n🛫 *Origem*: São Paulo (GRU)\n🛬 *Destino*: Rio de Janeiro (GIG)\n\n` +
            `Escolha uma das opções abaixo:\n\n✈️ Remarcar voo\n💰 Solicitar reembolso\n\n_Equipe VIA AIR ✈️💛_`;
          buttons = [
            { id: "flight_alert:TEST-CANCEL:reschedule", title: "Remarcar voo" },
            { id: "flight_alert:TEST-CANCEL:refund", title: "Solicitar reembolso" },
          ];
        } else if (scenario === "minor") {
          text =
            `Olá, ${nome}! 👋\n\n*Informamos uma atualização no seu voo ${voo}.*\n\n🎫 *Localizador*: ${localizador}\n\n` +
            `🕓 *Horário de saída*\n• *Anterior*: 20/07/2026 14:30\n• *Atual*: 20/07/2026 14:45\n\n` +
            `🛬 *Horário de chegada*\n• *Anterior*: 20/07/2026 16:10\n• *Atual*: 20/07/2026 16:25\n\n` +
            `ℹ️ _Alteração inferior a 30 minutos. Sua reserva permanece confirmada._\n\n- _Equipe VIA AIR_`;
          buttons = [{ id: "flight_alert:TEST-MINOR:ack", title: "Ok, ciente" }];
        } else {
          text =
            `Olá, ${nome}! 👋\n\n*Informamos uma atualização no seu voo ${voo}.*\n\n🎫 *Localizador*: ${localizador}\n\n` +
            `🕓 *Horário de saída*\n• *Anterior*: 20/07/2026 14:30\n• *Atual*: 20/07/2026 18:45\n\n` +
            `🛬 *Horário de chegada*\n• *Anterior*: 20/07/2026 16:10\n• *Atual*: 20/07/2026 20:25\n\n` +
            `⚠️ *Alteração superior a 30 minutos. Conforme política da companhia, é possível solicitar alteração sem custo.*\n\n- _Equipe VIA AIR_`;
          buttons = [
            { id: "flight_alert:TEST-MAJOR:reschedule", title: "Remarcar voo" },
            { id: "flight_alert:TEST-MAJOR:refund", title: "Solicitar reembolso" },
          ];
        }

        const provider = uazConfiguredCheck() ? "uazapi" : "meta";
        let sent: { id: string | null; error?: string };
        let via: string;
        try {
          sent = await sendWhatsAppButtons({ to: phone, body: text, buttons });
          via = `${provider}-buttons`;
          if (!sent.id) throw new Error(sent.error ?? "no id");
        } catch (err) {
          sent = await sendWhatsAppText(phone, text);
          via = `${provider}-text-fallback`;
        }

        return Response.json({ ok: !!sent.id, id: sent.id, error: sent.error, via, provider, phone, scenario });
      },
    },
  },
});

function uazConfiguredCheck(): boolean {
  return !!(process.env.UAZAPI_URL && process.env.UAZAPI_TOKEN);
}
