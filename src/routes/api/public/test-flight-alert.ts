/**
 * Rota interna de teste: dispara um alerta simulado de alteração de voo pra um número,
 * e persiste um stub em `flight_change_alerts` pra que a resposta do cliente (botão ou
 * texto "Remarcar voo" / "Solicitar reembolso" / "Ok, ciente") seja detectada pelos
 * webhooks e dispare a resposta contextual da IA.
 *
 * Body:
 *   { phone: "5544...", scenario?: "minor"|"major"|"cancelled", force?: "reschedule"|"refund"|"ack" }
 *
 * `force` NÃO envia mensagem — pega o alerta pendente mais recente pra esse telefone
 * e chama handleFlightAlertReply direto (usado pra rodar o fluxo da IA sem
 * precisar tocar de novo no WhatsApp).
 *
 * Restrita a números explicitamente permitidos pra evitar abuso.
 */
import { createFileRoute } from "@tanstack/react-router";

const ALLOWED_PHONES = new Set(["5544999093642"]);

function normalizePhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  return d.startsWith("55") ? d : `55${d}`;
}

function phoneVariants(phone: string): string[] {
  const set = new Set<string>([phone]);
  if (phone.startsWith("55") && phone.length === 13) set.add(phone.slice(0, 4) + phone.slice(5));
  else if (phone.startsWith("55") && phone.length === 12) set.add(phone.slice(0, 4) + "9" + phone.slice(4));
  return Array.from(set);
}

export const Route = createFileRoute("/api/public/test-flight-alert")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as {
          phone?: string;
          scenario?: "minor" | "major" | "cancelled";
          force?: "reschedule" | "refund" | "ack";
        };
        if (!body.phone) return new Response("phone required", { status: 400 });
        const phone = normalizePhone(body.phone);
        if (!ALLOWED_PHONES.has(phone)) return new Response("phone not allowed", { status: 403 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Modo FORCE: não envia nada — só resolve o alerta pendente pela IA
        if (body.force) {
          const variants = phoneVariants(phone);
          const { data: pending } = await supabaseAdmin
            .from("flight_change_alerts")
            .select("id")
            .in("wa_phone", variants)
            .is("response", null)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (!pending?.id) return Response.json({ ok: false, error: "no pending alert" }, { status: 404 });

          const { data: conv } = await supabaseAdmin
            .from("wa_conversations")
            .select("id")
            .in("wa_phone", variants)
            .order("last_message_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (!conv?.id) return Response.json({ ok: false, error: "no conversation" }, { status: 404 });

          const { handleFlightAlertReply } = await import("@/lib/whatsapp/flight-alert-reply.server");
          await handleFlightAlertReply({
            conversation_id: conv.id,
            wa_phone: phone,
            button_id: `flight_alert:${pending.id}:${body.force}`,
          });
          return Response.json({ ok: true, forced: body.force, alert_id: pending.id, conversation_id: conv.id });
        }

        const scenario = body.scenario ?? "major";
        const { sendWhatsAppText } = await import("@/lib/whatsapp/send.server");
        const { sendWhatsAppButtons } = await import("@/lib/whatsapp/send-buttons.server");

        const nome = "Lucas";
        const voo = "LA3456";
        const localizador = "TEST99";

        // Pega qualquer par (order_id, order_item_id) pra satisfazer as NOT NULL
        // do stub em flight_change_alerts (é só teste).
        const { data: sample } = await supabaseAdmin
          .from("order_items")
          .select("id, order_id")
          .limit(1)
          .maybeSingle();
        if (!sample?.id || !sample.order_id) {
          return Response.json({ ok: false, error: "no order_items to reference" }, { status: 500 });
        }

        let text: string;
        let buttons: Array<{ id: string; title: string }>;
        let severity: "minor" | "major" | "cancelled" = scenario;

        if (scenario === "cancelled") {
          text =
            `Olá, ${nome}! 👋\n\n*Recebemos a informação de que o seu voo ${voo} foi cancelado pela companhia aérea.*\n\n` +
            `🎫 *Localizador: ${localizador}*\n\n❌ *Voo cancelado*: ${voo}\n📅 *Data*: 20/07/2026\n🛫 *Origem*: São Paulo (GRU)\n🛬 *Destino*: Rio de Janeiro (GIG)\n\n` +
            `Escolha uma das opções abaixo:\n\n✈️ Remarcar voo\n💰 Solicitar reembolso\n\n_Equipe VIA AIR ✈️💛_`;
          buttons = [
            { id: "flight_alert:PENDING:reschedule", title: "Remarcar voo" },
            { id: "flight_alert:PENDING:refund", title: "Solicitar reembolso" },
          ];
        } else if (scenario === "minor") {
          text =
            `Olá, ${nome}! 👋\n\n*Informamos uma atualização no seu voo ${voo}.*\n\n🎫 *Localizador*: ${localizador}\n\n` +
            `🕓 *Horário de saída*\n• *Anterior*: 20/07/2026 14:30\n• *Atual*: 20/07/2026 14:45\n\n` +
            `🛬 *Horário de chegada*\n• *Anterior*: 20/07/2026 16:10\n• *Atual*: 20/07/2026 16:25\n\n` +
            `ℹ️ _Alteração inferior a 30 minutos. Sua reserva permanece confirmada._\n\n- _Equipe VIA AIR_`;
          buttons = [{ id: "flight_alert:PENDING:ack", title: "Ok, ciente" }];
        } else {
          text =
            `Olá, ${nome}! 👋\n\n*Informamos uma atualização no seu voo ${voo}.*\n\n🎫 *Localizador*: ${localizador}\n\n` +
            `🕓 *Horário de saída*\n• *Anterior*: 20/07/2026 14:30\n• *Atual*: 20/07/2026 18:45\n\n` +
            `🛬 *Horário de chegada*\n• *Anterior*: 20/07/2026 16:10\n• *Atual*: 20/07/2026 20:25\n\n` +
            `⚠️ *Alteração superior a 30 minutos. Conforme política da companhia, é possível solicitar alteração sem custo.*\n\n- _Equipe VIA AIR_`;
          buttons = [
            { id: "flight_alert:PENDING:reschedule", title: "Remarcar voo" },
            { id: "flight_alert:PENDING:refund", title: "Solicitar reembolso" },
          ];
        }

        // Cria o stub ANTES do envio pra que o texto/id já leve o alertId real
        const { data: alertRow, error: alertErr } = await supabaseAdmin
          .from("flight_change_alerts")
          .insert({
            order_id: sample.order_id,
            order_item_id: sample.id,
            flight_number: voo,
            old_depart_at: "2026-07-20 14:30",
            new_depart_at: scenario === "cancelled" ? null : (scenario === "minor" ? "2026-07-20 14:45" : "2026-07-20 18:45"),
            old_arrive_at: "2026-07-20 16:10",
            new_arrive_at: scenario === "cancelled" ? null : (scenario === "minor" ? "2026-07-20 16:25" : "2026-07-20 20:25"),
            new_status: scenario === "cancelled" ? "cancelled" : "changed",
            severity,
            wa_phone: phone,
            summary: `TESTE ${scenario} — ${voo}`,
          })
          .select("id")
          .maybeSingle();
        if (alertErr || !alertRow?.id) {
          return Response.json({ ok: false, error: `insert alert failed: ${alertErr?.message}` }, { status: 500 });
        }

        buttons = buttons.map((b) => ({ ...b, id: b.id.replace(":PENDING:", `:${alertRow.id}:`) }));

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

        if (sent.id) {
          await supabaseAdmin
            .from("flight_change_alerts")
            .update({ wa_button_message_id: sent.id })
            .eq("id", alertRow.id);

          // Registra no chat como mensagem do sistema pra IA ter contexto
          // quando o cliente responder (mesmo padrão do hook real check-flight-changes).
          const { logSystemOutbound } = await import("@/lib/whatsapp/log-system-outbound.server");
          await logSystemOutbound({
            wa_phone: phone,
            kind: scenario === "cancelled" ? "flight_cancel_alert" : "flight_change_alert",
            summary:
              scenario === "cancelled"
                ? `[TESTE] Aviso automático de CANCELAMENTO enviado (voo ${voo} · localizador ${localizador}). Cliente pode responder "Remarcar voo" ou "Solicitar reembolso".`
                : `[TESTE] Aviso automático de alteração de voo enviado (voo ${voo} · localizador ${localizador}). Cliente pode responder ${scenario === "minor" ? '"Ok, ciente".' : '"Remarcar voo" ou "Solicitar reembolso".'}`,
            wa_message_id: sent.id,
            meta: {
              test: true,
              alert_id: alertRow.id,
              locator: localizador,
              flight: voo,
              scenario,
            },
          });
        }

        return Response.json({
          ok: !!sent.id,
          id: sent.id,
          error: sent.error,
          via,
          provider,
          phone,
          scenario,
          alert_id: alertRow.id,
        });
      },
    },
  },
});

function uazConfiguredCheck(): boolean {
  return !!(process.env.UAZAPI_URL && process.env.UAZAPI_TOKEN);
}
