import { createFileRoute } from "@tanstack/react-router";

/**
 * Robô dos lembretes da agenda (cron `calendar-jobs`, 1x por minuto).
 *
 * Pega os jobs pendentes com `claim_calendar_jobs` (FOR UPDATE SKIP LOCKED),
 * envia o Web Push para todos os aparelhos e marca o job como enviado.
 * Nunca envia o mesmo job duas vezes.
 */

type Job = {
  id: string;
  event_id: string;
  scheduled_for: string;
  reminder_type: string;
  attempts: number;
};

type Evento = {
  id: string;
  titulo: string;
  inicio: string;
  local: string | null;
  dia_inteiro: boolean;
  timezone: string | null;
  notifications_enabled: boolean | null;
  concluido_em: string | null;
  deleted_at: string | null;
};

function rotulo(tipo: string): string {
  if (tipo === "inicio") return "Agora";
  if (tipo === "dia_inteiro") return "Compromisso de hoje";
  if (tipo === "vespera") return "Compromisso amanhã";
  const m = Number(tipo.replace("antes_", ""));
  if (!Number.isFinite(m)) return "Lembrete da agenda";
  if (m % 1440 === 0) return `Compromisso em ${m / 1440} dia${m / 1440 > 1 ? "s" : ""}`;
  if (m % 60 === 0) return `Compromisso em ${m / 60} hora${m / 60 > 1 ? "s" : ""}`;
  return `Compromisso em ${m} minutos`;
}

export const Route = createFileRoute("/api/public/hooks/calendar-jobs")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { enviarPush } = await import("@/lib/whatsapp/webpush.server");
        const { horaLocal, FUSO_PADRAO } = await import("@/lib/calendar/reminders.server");

        const { data: jobsRaw, error: erroClaim } = await supabaseAdmin.rpc("claim_calendar_jobs", { p_limit: 100 });
        if (erroClaim) return Response.json({ ok: false, erro: erroClaim.message }, { status: 500 });
        const jobs = (jobsRaw ?? []) as Job[];
        if (jobs.length === 0) return Response.json({ ok: true, jobs: 0 });

        // aparelhos: atendentes logados (chat) + aparelhos do app da agenda por link
        const [{ data: chatSubs }, { data: appSubs }] = await Promise.all([
          supabaseAdmin
            .from("wa_chat_push_subs")
            .select("id, endpoint, p256dh, auth, failure_count")
            .eq("ativo", true)
            .eq("pref_agenda", true),
          supabaseAdmin
            .from("wa_calendar_push_subs")
            .select("id, endpoint, p256dh, auth")
            .eq("ativo", true)
            .eq("pref_lembrete", true),
        ]);

        const destinos = [
          ...((chatSubs ?? []) as Array<{ id: string; endpoint: string; p256dh: string; auth: string }>).map((s) => ({
            ...s,
            tabela: "wa_chat_push_subs" as const,
          })),
          ...((appSubs ?? []) as Array<{ id: string; endpoint: string; p256dh: string; auth: string }>).map((s) => ({
            ...s,
            tabela: "wa_calendar_push_subs" as const,
          })),
        ];

        const ids = [...new Set(jobs.map((j) => j.event_id))];
        const { data: evsRaw } = await supabaseAdmin
          .from("wa_calendar_events")
          .select("id, titulo, inicio, local, dia_inteiro, timezone, notifications_enabled, concluido_em, deleted_at")
          .in("id", ids);
        const eventos = new Map(((evsRaw ?? []) as Evento[]).map((e) => [e.id, e]));

        let enviados = 0;
        let falhas = 0;
        const agora = new Date().toISOString();

        for (const job of jobs) {
          const ev = eventos.get(job.event_id);
          if (!ev || ev.deleted_at || ev.notifications_enabled === false || ev.concluido_em) {
            await supabaseAdmin
              .from("wa_calendar_notification_jobs")
              .update({ status: "cancelled", processed_at: agora, updated_at: agora })
              .eq("id", job.id);
            continue;
          }

          const tz = ev.timezone || FUSO_PADRAO;
          const corpo = ev.dia_inteiro
            ? `${ev.titulo} — evento de dia inteiro${ev.local ? ` — ${ev.local}` : ""}`
            : `${ev.titulo} — ${horaLocal(ev.inicio, tz)}${ev.local ? ` — ${ev.local}` : ""}`;

          const payload = {
            type: ev.dia_inteiro ? "calendar_all_day" : "calendar_reminder",
            title: rotulo(job.reminder_type),
            body: corpo,
            url: `/chat/agenda?ev=${ev.id}`,
            eventId: ev.id,
            tag: `calendar-event-${ev.id}`,
            icon: "/icon-chat-192.png",
            badge: "/icon-chat-192.png",
          };

          if (destinos.length === 0) {
            await supabaseAdmin
              .from("wa_calendar_notification_jobs")
              .update({ status: "sent", processed_at: agora, updated_at: agora, last_error: "sem aparelhos" })
              .eq("id", job.id);
            continue;
          }

          const resultados = await Promise.allSettled(
            destinos.map(async (d) => {
              const r = await enviarPush({ endpoint: d.endpoint, p256dh: d.p256dh, auth: d.auth }, payload as never);
              if (r.gone) {
                // 404/410 → assinatura morta, desativa só aquele aparelho
                await supabaseAdmin.from(d.tabela).update({ ativo: false }).eq("id", d.id);
              }
              return r;
            }),
          );

          const algumOk = resultados.some((r) => r.status === "fulfilled" && r.value.ok);
          if (algumOk) {
            enviados++;
            await supabaseAdmin
              .from("wa_calendar_notification_jobs")
              .update({ status: "sent", processed_at: agora, updated_at: agora, last_error: null })
              .eq("id", job.id);
            await supabaseAdmin
              .from("wa_calendar_events")
              .update({ notification_processed_at: agora })
              .eq("id", ev.id);
          } else {
            falhas++;
            // erro temporário: volta pra fila até 5 tentativas
            const desiste = job.attempts >= 5;
            await supabaseAdmin
              .from("wa_calendar_notification_jobs")
              .update({
                status: desiste ? "failed" : "pending",
                updated_at: agora,
                processed_at: desiste ? agora : null,
                last_error: "falha temporária no serviço de push",
              })
              .eq("id", job.id);
          }
        }

        // limpeza: jobs concluídos há mais de 14 dias
        await supabaseAdmin
          .from("wa_calendar_notification_jobs")
          .delete()
          .in("status", ["sent", "cancelled", "failed"])
          .lt("processed_at", new Date(Date.now() - 14 * 24 * 3600_000).toISOString());

        return Response.json({ ok: true, jobs: jobs.length, enviados, falhas, aparelhos: destinos.length });
      },
      GET: async () => Response.json({ ok: true, info: "use POST" }),
    },
  },
});
