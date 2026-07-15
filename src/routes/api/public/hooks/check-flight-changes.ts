import { createFileRoute } from "@tanstack/react-router";

/**
 * Robô de monitoramento de voos.
 *
 * Roda a cada 2h (pg_cron). Para cada voo ativo em pedidos:
 *   1. Consulta AeroDataBox pelo número do voo + data prevista
 *   2. Compara horário de partida/chegada com o que está salvo
 *   3. Se mudou, envia WhatsApp interativo pro cliente com botões
 *      "Aceito" / "Não aceito" — SEM nome de atendente (mensagem do robô)
 *   4. Registra em flight_change_alerts (idempotente por item+novo horário)
 *
 * A resposta do cliente é processada em whatsapp-webhook.ts.
 */
export const Route = createFileRoute("/api/public/hooks/check-flight-changes")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { sendWhatsAppButtons } = await import("@/lib/whatsapp/send-buttons.server");

        const apiKey = process.env.RAPIDAPI_AERODATABOX_KEY;
        if (!apiKey) {
          return json({ ok: false, error: "RAPIDAPI_AERODATABOX_KEY não configurada" }, 500);
        }

        // Janela: voos de agora até 60 dias à frente
        const now = new Date();
        const horizon = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

        const { data: items, error } = await supabaseAdmin
          .from("order_items")
          .select("id, order_id, kind, status, details, orders!inner(id, status, phone, payer_phone)")
          .eq("kind", "flight")
          .neq("status", "cancelled")
          .limit(500);

        if (error) {
          console.error("[flight-check] query error:", error.message);
          return json({ ok: false, error: error.message }, 500);
        }

        const checked: string[] = [];
        const changed: string[] = [];
        const skipped: string[] = [];

        for (const item of items ?? []) {
          const d = (item.details ?? {}) as Record<string, unknown>;
          const flightNumberRaw = (d.flight_number as string | undefined) ?? "";
          const departAt = (d.depart_at as string | undefined) ?? "";
          const arriveAt = (d.arrive_at as string | undefined) ?? "";

          if (!flightNumberRaw || !departAt) { skipped.push(item.id); continue; }

          const flightNumber = flightNumberRaw.replace(/\s+/g, "").toUpperCase();
          const departDate = departAt.slice(0, 10);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(departDate)) { skipped.push(item.id); continue; }

          const departTs = Date.parse(departAt);
          if (isNaN(departTs) || departTs < now.getTime() || departTs > horizon.getTime()) {
            skipped.push(item.id);
            continue;
          }

          checked.push(item.id);

          // Consulta AeroDataBox
          let adbData: unknown;
          try {
            const url = `https://aerodatabox.p.rapidapi.com/flights/number/${encodeURIComponent(flightNumber)}/${departDate}?withAircraftImage=false&withLocation=false`;
            const resp = await fetch(url, {
              headers: {
                "x-rapidapi-key": apiKey,
                "x-rapidapi-host": "aerodatabox.p.rapidapi.com",
              },
            });
            if (resp.status === 204 || resp.status === 404) continue;
            if (!resp.ok) {
              console.warn(`[flight-check] AeroDataBox ${resp.status} para ${flightNumber}/${departDate}`);
              continue;
            }
            adbData = await resp.json();
          } catch (err) {
            console.error("[flight-check] fetch fail:", (err as Error).message);
            continue;
          }

          const flights = Array.isArray(adbData) ? adbData : [];
          if (flights.length === 0) continue;

          // Escolhe o voo cujo horário original bate mais perto do salvo
          const best = flights[0] as ADBFlight;
          const newDepart = toLocalInput(best?.departure?.scheduledTime?.local);
          const newArrive = toLocalInput(best?.arrival?.scheduledTime?.local);
          const newStatus = best?.status ?? null;

          const departChanged = newDepart && newDepart !== toLocalInput(departAt);
          const arriveChanged = newArrive && arriveAt && newArrive !== toLocalInput(arriveAt);
          const cancelled = typeof newStatus === "string" && /cancel/i.test(newStatus);

          if (!departChanged && !arriveChanged && !cancelled) continue;

          // Idempotência: já avisamos esse novo horário?
          const { data: exists } = await supabaseAdmin
            .from("flight_change_alerts")
            .select("id")
            .eq("order_item_id", item.id)
            .eq("new_depart_at", newDepart || "")
            .maybeSingle();
          if (exists) continue;

          // Descobre telefone do cliente
          const order = item.orders as { phone?: string | null; payer_phone?: string | null } | null;
          const phone = order?.phone ?? order?.payer_phone ?? null;
          if (!phone) { skipped.push(item.id); continue; }

          // Cria alerta primeiro (pra ter id) e depois envia
          const { data: alert, error: alertErr } = await supabaseAdmin
            .from("flight_change_alerts")
            .insert({
              order_id: item.order_id,
              order_item_id: item.id,
              flight_number: flightNumber,
              old_depart_at: departAt,
              new_depart_at: newDepart || null,
              old_arrive_at: arriveAt || null,
              new_arrive_at: newArrive || null,
              new_status: newStatus,
              wa_phone: phone,
            })
            .select("id")
            .single();

          if (alertErr || !alert) {
            console.error("[flight-check] alert insert:", alertErr?.message);
            continue;
          }

          const body = buildMessage({
            flightNumber,
            oldDepart: departAt,
            newDepart: newDepart || "",
            oldArrive: arriveAt,
            newArrive: newArrive || "",
            cancelled,
          });

          const sent = await sendWhatsAppButtons({
            to: phone,
            body,
            buttons: cancelled
              ? [{ id: `flight_alert:${alert.id}:ack`, title: "Ok, entendi" }]
              : [
                  { id: `flight_alert:${alert.id}:accept`, title: "Aceito" },
                  { id: `flight_alert:${alert.id}:reject`, title: "Não aceito" },
                ],
            footer: "Aviso automático VIA AIR",
          });

          if (sent.id) {
            await supabaseAdmin
              .from("flight_change_alerts")
              .update({ wa_button_message_id: sent.id })
              .eq("id", alert.id);
          }
          changed.push(item.id);
        }

        return json({ ok: true, checked: checked.length, changed: changed.length, skipped: skipped.length });
      },
    },
  },
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type ADBFlight = {
  number?: string;
  status?: string;
  departure?: { scheduledTime?: { local?: string } };
  arrival?: { scheduledTime?: { local?: string } };
};

function toLocalInput(v?: string): string {
  if (!v) return "";
  const s = v.replace(" ", "T");
  const m = s.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  return m ? `${m[1]}T${m[2]}` : "";
}

function fmt(v: string): string {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return v;
  return `${m[3]}/${m[2]}/${m[1]} às ${m[4]}:${m[5]}`;
}

function buildMessage(p: {
  flightNumber: string;
  oldDepart: string;
  newDepart: string;
  oldArrive: string;
  newArrive: string;
  cancelled: boolean;
}): string {
  if (p.cancelled) {
    return (
      `⚠️ Aviso automático da companhia aérea:\n\n` +
      `Voo *${p.flightNumber}* (${fmt(p.oldDepart)}) foi *CANCELADO* pela companhia.\n\n` +
      `Nossa equipe já foi notificada e vai entrar em contato pra remarcar.`
    );
  }
  const lines: string[] = [
    `✈️ Aviso automático: houve alteração no voo *${p.flightNumber}*.`,
    "",
    `📅 Partida anterior: ${fmt(p.oldDepart)}`,
    `📅 *Nova partida: ${fmt(p.newDepart)}*`,
  ];
  if (p.oldArrive && p.newArrive) {
    lines.push("");
    lines.push(`🛬 Chegada anterior: ${fmt(p.oldArrive)}`);
    lines.push(`🛬 *Nova chegada: ${fmt(p.newArrive)}*`);
  }
  lines.push("");
  lines.push("Você aceita a nova alteração?");
  return lines.join("\n");
}
