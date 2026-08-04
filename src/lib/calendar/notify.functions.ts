/**
 * Preferências e testes das notificações da Agenda (Web Push real).
 * As mensagens do chat têm preferências próprias e não são alteradas aqui.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const PADRAO = {
  ativo: true,
  lembretes: [15],
  hora_dia_inteiro: 8,
  aviso_vespera: false,
  hora_vespera: 18,
  som: true,
  timezone: "America/Sao_Paulo",
};

/** Preferências da agenda + aparelhos cadastrados do atendente logado. */
export const lerPrefsAgenda = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: prefs } = await context.supabase
      .from("wa_calendar_notify_prefs")
      .select("ativo, lembretes, hora_dia_inteiro, aviso_vespera, hora_vespera, som, timezone")
      .eq("user_id", context.userId!)
      .maybeSingle();

    const { data: aparelhos } = await context.supabase
      .from("wa_chat_push_subs")
      .select("id, endpoint, device_name, ativo, pref_agenda, pref_novas, last_success_at")
      .order("created_at", { ascending: false });

    const { data: jobs } = await context.supabase
      .from("wa_calendar_notification_jobs")
      .select("id, scheduled_for, reminder_type, status")
      .eq("status", "pending")
      .order("scheduled_for", { ascending: true })
      .limit(5);

    return {
      prefs: prefs ?? PADRAO,
      aparelhos: aparelhos ?? [],
      proximos: jobs ?? [],
    };
  });

export const salvarPrefsAgenda = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        ativo: z.boolean(),
        lembretes: z.array(z.number().int().min(0).max(20160)).max(8),
        hora_dia_inteiro: z.number().int().min(0).max(23),
        aviso_vespera: z.boolean(),
        hora_vespera: z.number().int().min(0).max(23),
        som: z.boolean(),
        timezone: z.string().min(3).max(60).optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("wa_calendar_notify_prefs").upsert(
      {
        user_id: context.userId,
        ativo: data.ativo,
        lembretes: data.lembretes.length ? data.lembretes : [15],
        hora_dia_inteiro: data.hora_dia_inteiro,
        aviso_vespera: data.aviso_vespera,
        hora_vespera: data.hora_vespera,
        som: data.som,
        timezone: data.timezone ?? "America/Sao_Paulo",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);

    // recalcula a fila dos próximos dias com as novas preferências
    const { garantirLembretesFuturos } = await import("@/lib/calendar/reminders.server");
    await garantirLembretesFuturos();
    return { ok: true };
  });

/** Liga/desliga só os lembretes da agenda neste aparelho (mensagens continuam). */
export const agendaNesteAparelho = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ endpoint: z.string().url(), ativo: z.boolean() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("wa_chat_push_subs")
      .update({ pref_agenda: data.ativo, updated_at: new Date().toISOString() })
      .eq("endpoint", data.endpoint);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Teste real: cria um compromisso de teste daqui a 2 minutos com lembrete de
 * 1 minuto. O aviso sai pelo cron → Web Push → Service Worker (app fechado).
 */
export const testarLembreteAgenda = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { reagendarLembretes } = await import("@/lib/calendar/reminders.server");
    const agora = Date.now();
    const inicio = new Date(agora + 2 * 60_000);
    const fim = new Date(agora + 32 * 60_000);
    const email = (context as { claims?: { email?: string } }).claims?.email ?? null;

    const { data, error } = await supabaseAdmin
      .from("wa_calendar_events")
      .insert({
        uid: `teste-lembrete-${agora}@viaair.tur.br`,
        titulo: "Teste de lembrete da agenda",
        descricao: "Compromisso criado pelo botão de teste das notificações.",
        local: null,
        inicio: inicio.toISOString(),
        fim: fim.toISOString(),
        dia_inteiro: false,
        provider: "titan",
        origem: "teste",
        timezone: "America/Sao_Paulo",
        reminder_minutes: [1],
        criado_por: email,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await reagendarLembretes(data.id as string);
    return { ok: true, id: data.id as string, quando: new Date(agora + 60_000).toISOString() };
  });

/** Marca (ou desmarca) um compromisso como concluído — usado no badge e nos avisos. */
export const concluirCompromisso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid(), concluido: z.boolean() }).parse(raw))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("wa_calendar_events")
      .update({ concluido_em: data.concluido ? new Date().toISOString() : null })
      .eq("id", data.id);
    if (data.concluido) {
      const { cancelarLembretes } = await import("@/lib/calendar/reminders.server");
      await cancelarLembretes(data.id);
    }
    return { ok: true };
  });
