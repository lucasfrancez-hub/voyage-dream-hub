import { createFileRoute } from "@tanstack/react-router";

/**
 * Robô de monitoramento de voos.
 *
 * Roda a cada 2h (pg_cron). Para cada voo ativo em pedidos:
 *   1. Consulta AeroDataBox pelo número do voo + data prevista
 *   2. Compara horário de partida/chegada com o que está salvo
 *   3. Se mudou, envia WhatsApp interativo pro cliente com botões
 *      (mensagem do robô, sem nome de atendente)
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

        const now = new Date();
        const horizon = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

        // Paginação: varre TODOS os voos ativos de TODOS os pedidos (não cancelados),
        // em lotes de 500. Cada voo consome 1 request AeroDataBox por execução.
        // Filtro de janela (agora → +60 dias) evita gastar consulta em voo passado.
        const PAGE = 500;
        let from = 0;
        const items: FlightItemRow[] = [];
        while (true) {
          const { data: page, error } = await supabaseAdmin
            .from("order_items")
            .select(
              "id, order_id, kind, status, details, orders!inner(id, status, phone, payer_phone, full_name, payer_full_name, airline_locator)",
            )
            .eq("kind", "flight")
            .neq("status", "cancelled")
            .not("orders.status", "in", "(cancelled,refunded,canceled)")
            .order("id", { ascending: true })
            .range(from, from + PAGE - 1);
          if (error) {
            console.error("[flight-check] query error:", error.message);
            return json({ ok: false, error: error.message }, 500);
          }
          const rows = (page ?? []) as FlightItemRow[];
          items.push(...rows);
          if (rows.length < PAGE) break;
          from += PAGE;
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

          const best = flights[0] as ADBFlight;
          const newDepart = toLocalInput(best?.departure?.scheduledTime?.local);
          const newArrive = toLocalInput(best?.arrival?.scheduledTime?.local);
          const newFlightNumber = (best?.number ?? flightNumberRaw).replace(/\s+/g, "").toUpperCase();
          const newStatus = best?.status ?? null;

          const departChanged = newDepart && newDepart !== toLocalInput(departAt);
          const arriveChanged = newArrive && arriveAt && newArrive !== toLocalInput(arriveAt);
          const flightChanged = newFlightNumber && newFlightNumber !== flightNumber;
          const cancelled = typeof newStatus === "string" && /cancel/i.test(newStatus);

          if (!departChanged && !arriveChanged && !flightChanged && !cancelled) continue;

          const { data: exists } = await supabaseAdmin
            .from("flight_change_alerts")
            .select("id")
            .eq("order_item_id", item.id)
            .eq("new_depart_at", newDepart || "")
            .maybeSingle();
          if (exists) continue;

          const order = item.orders as OrderRow | null;
          const phone = order?.phone ?? order?.payer_phone ?? null;
          if (!phone) { skipped.push(item.id); continue; }

          const diffMin = diffMinutes(departAt, newDepart);
          const dayChanged = (departAt.slice(0, 10) !== (newDepart || "").slice(0, 10)) && !!newDepart;
          const minorChange = !cancelled && !dayChanged && diffMin !== null && Math.abs(diffMin) < 30;
          const severity: "info" | "minor" | "major" | "cancelled" =
            cancelled ? "cancelled" : minorChange ? "minor" : "major";
          const severityLabel =
            severity === "cancelled" ? "Voo cancelado"
              : severity === "minor" ? "Alteração pequena (< 30min)"
              : "Alteração significativa (> 30min)";

          const routeLabel = routeLine({
            fromCity: str(d.from_city), fromIata: str(d.from_iata), fromAirport: str(d.from_airport),
            toCity: str(d.to_city), toIata: str(d.to_iata), toAirport: str(d.to_airport),
          }).replace(/\*/g, "");

          const summary = `${severityLabel} — ${newFlightNumber || flightNumber} ${routeLabel || ""} · ${
            fmtLong(newDepart || departAt)
          }`.trim();

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
              severity,
              summary,
            })
            .select("id")
            .single();

          if (alertErr || !alert) {
            console.error("[flight-check] alert insert:", alertErr?.message);
            continue;
          }

          const body = buildMessage({
            customerName: order?.full_name ?? order?.payer_full_name ?? null,
            locator: order?.airline_locator ?? null,
            fromIata: str(d.from_iata),
            fromCity: str(d.from_city),
            fromAirport: str(d.from_airport),
            toIata: str(d.to_iata),
            toCity: str(d.to_city),
            toAirport: str(d.to_airport),
            oldFlightNumber: flightNumber,
            newFlightNumber: newFlightNumber || flightNumber,
            oldDepart: departAt,
            newDepart: newDepart || "",
            oldArrive: arriveAt,
            newArrive: newArrive || "",
            dayChanged,
            cancelled,
            minorChange,
          });

          const sent = await sendWhatsAppButtons({
            to: phone,
            body,
            buttons: cancelled
              ? [
                  { id: `flight_alert:${alert.id}:reschedule`, title: "Remarcar" },
                  { id: `flight_alert:${alert.id}:refund`, title: "Reembolso" },
                ]
              : minorChange
                ? [{ id: `flight_alert:${alert.id}:ack`, title: "Ok, ciente" }]
                : [
                    { id: `flight_alert:${alert.id}:reschedule`, title: "Remarcar" },
                    { id: `flight_alert:${alert.id}:refund`, title: "Reembolso" },
                  ],
            footer: "Aviso automático VIA AIR",
          });

          if (sent.id) {
            await supabaseAdmin
              .from("flight_change_alerts")
              .update({ wa_button_message_id: sent.id })
              .eq("id", alert.id);
          }

          // E-mail para o admin (não bloqueia o loop se falhar)
          const adminEmail = process.env.AGENCIA_EMAIL_ASSINATURA;
          if (adminEmail) {
            try {
              const { sendTransactionalInternal } = await import("@/lib/email/send-internal.server");
              const { data: ord } = await supabaseAdmin
                .from("orders")
                .select("order_number")
                .eq("id", item.order_id)
                .maybeSingle();
              const res = await sendTransactionalInternal({
                templateName: "alteracao-voo-admin",
                recipientEmail: adminEmail,
                idempotencyKey: `flight-alert-${alert.id}`,
                templateData: {
                  orderNumber: ord?.order_number ?? item.order_id.slice(0, 8),
                  customerName: order?.full_name ?? order?.payer_full_name ?? "Cliente",
                  customerPhone: phone,
                  reservationCode: order?.airline_locator ?? undefined,
                  route: routeLabel,
                  flightNumber: newFlightNumber || flightNumber,
                  oldDepart: fmtLong(departAt),
                  newDepart: newDepart ? fmtLong(newDepart) : "—",
                  oldArrive: arriveAt ? fmtLong(arriveAt) : undefined,
                  newArrive: newArrive ? fmtLong(newArrive) : undefined,
                  status: newStatus ?? undefined,
                  severityLabel,
                },
              });
              if (res.success) {
                await supabaseAdmin
                  .from("flight_change_alerts")
                  .update({ admin_email_sent_at: new Date().toISOString() })
                  .eq("id", alert.id);
              } else {
                console.warn("[flight-check] admin email:", res.error);
              }
            } catch (err) {
              console.error("[flight-check] admin email crash:", (err as Error).message);
            }
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

type OrderRow = {
  phone?: string | null;
  payer_phone?: string | null;
  full_name?: string | null;
  payer_full_name?: string | null;
  airline_locator?: string | null;
};

type FlightItemRow = {
  id: string;
  order_id: string;
  kind: string;
  status: string | null;
  details: Record<string, unknown> | null;
  orders: OrderRow | null;
};



type ADBFlight = {
  number?: string;
  status?: string;
  departure?: { scheduledTime?: { local?: string } };
  arrival?: { scheduledTime?: { local?: string } };
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function toLocalInput(v?: string): string {
  if (!v) return "";
  const s = v.replace(" ", "T");
  const m = s.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  return m ? `${m[1]}T${m[2]}` : "";
}

function diffMinutes(a: string, b: string): number | null {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (isNaN(ta) || isNaN(tb)) return null;
  return Math.round((tb - ta) / 60000);
}

const WEEKDAYS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const MONTHS = [
  "janeiro","fevereiro","março","abril","maio","junho",
  "julho","agosto","setembro","outubro","novembro","dezembro",
];

function fmtLong(v: string): string {
  // v = "YYYY-MM-DDTHH:mm"
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return v;
  const [, y, mo, day, hh, mm] = m;
  const dt = new Date(Number(y), Number(mo) - 1, Number(day));
  const wd = WEEKDAYS[dt.getDay()];
  const month = MONTHS[Number(mo) - 1];
  return `${wd}, ${day} de ${month} de ${y}, ${hh}:${mm}.`;
}

function firstName(full: string | null): string {
  if (!full) return "";
  return full.trim().split(/\s+/)[0].toUpperCase();
}

function routeLine(p: {
  fromCity: string; fromIata: string; fromAirport: string;
  toCity: string; toIata: string; toAirport: string;
}): string {
  const from = p.fromCity
    ? `${p.fromCity}${p.fromIata ? ` (${p.fromIata})` : ""}`
    : (p.fromAirport || p.fromIata || "");
  const to = p.toCity
    ? `${p.toCity}${p.toIata ? ` (${p.toIata})` : ""}`
    : (p.toAirport || p.toIata || "");
  if (!from || !to) return "";
  return `*${from}* a *${to}*`;
}

function destinationName(p: { toCity: string; toAirport: string; toIata: string }): string {
  return p.toCity || p.toAirport || p.toIata || "seu destino";
}

function buildMessage(p: {
  customerName: string | null;
  locator: string | null;
  fromIata: string; fromCity: string; fromAirport: string;
  toIata: string; toCity: string; toAirport: string;
  oldFlightNumber: string;
  newFlightNumber: string;
  oldDepart: string;
  newDepart: string;
  oldArrive: string;
  newArrive: string;
  dayChanged: boolean;
  cancelled: boolean;
  minorChange: boolean;
}): string {
  const hi = firstName(p.customerName);
  const destino = destinationName(p);
  const rota = routeLine(p);
  const reserva = p.locator ? `\n* _Reserva *${p.locator}*_\n` : "";

  const verbo = p.cancelled ? "cancelado" : "modificado";
  const abertura =
    `Olá${hi ? ` ${hi}` : ""},\n\n` +
    `Lamentamos comunicar que seu voo com destino a *${destino}* foi *${verbo}.*\n\n` +
    `Pedimos sinceras desculpas se isso modifica seus planos.\n\n` +
    `Confira os detalhes 👇\n` +
    reserva;

  const rotaBlock = rota ? `\n${rota}\n` : "\n";

  const novoBlock = p.cancelled
    ? ""
    : (
        `\n🛫 *Novo voo* *${p.newFlightNumber}* 🟢\n\n` +
        `_*Partida:* ${fmtLong(p.newDepart)}_\n\n` +
        (p.newArrive ? `_*Chegada:* ${fmtLong(p.newArrive)}_\n` : "")
      );

  const anteriorBlock =
    `\n🛬 *Voo anterior* *${p.oldFlightNumber}* 🔴\n\n` +
    `_*Partida:* ${fmtLong(p.oldDepart)}_\n\n` +
    (p.oldArrive ? `_*Chegada:* ${fmtLong(p.oldArrive)}_\n` : "");

  let footer: string;
  if (p.cancelled) {
    footer =
      `\nSeu voo foi *cancelado pela companhia*. Por regra da ANAC, você tem direito a *remarcação sem custo* ou *reembolso integral*.\n\n` +
      `Escolha uma das opções abaixo para acionar nossa equipe 👇`;
  } else if (p.minorChange) {
    footer =
      `\nℹ️ Como sua alteração foi *inferior a 30 minutos*, ela *não permite remarcação ou solicitação de reembolso sem custo*.\n\n` +
      `Estamos enviando apenas para *mero informativo*, para que você fique ciente da nova programação.`;
  } else {
    const motivo = p.dayChanged
      ? "houve *mudança de dia* na sua programação"
      : "sua alteração foi *superior a 30 minutos*";
    footer =
      `\nComo ${motivo}, você pode escolher uma das seguintes opções:\n\n` +
      `👉 *Remarcar sem custo* a data do seu voo para o mesmo destino e mesma cabine.\n\n` +
      `👉 *Solicitar o reembolso* integral do valor pago.\n\n` +
      `Clique no botão abaixo para acionar nossa equipe 👇`;
  }

  return abertura + rotaBlock + novoBlock + anteriorBlock + footer;
}
