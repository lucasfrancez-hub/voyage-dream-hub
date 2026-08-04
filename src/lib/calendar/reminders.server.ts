/**
 * Lembretes da agenda — cálculo e fila (SERVER-ONLY).
 *
 * Fluxo: compromisso criado/editado → `reagendarLembretes(eventId)` calcula os
 * horários e grava jobs pendentes em `wa_calendar_notification_jobs`.
 * O robô `/api/public/hooks/calendar-jobs` (cron de 1 em 1 minuto) envia.
 *
 * Nada aqui usa setTimeout: tudo fica no banco e é disparado pelo cron.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const FUSO_PADRAO = "America/Sao_Paulo";

export type PrefsAgenda = {
  lembretes: number[];
  horaDiaInteiro: number;
  avisoVespera: boolean;
  horaVespera: number;
  timezone: string;
};

const PREFS_PADRAO: PrefsAgenda = {
  lembretes: [15],
  horaDiaInteiro: 8,
  avisoVespera: false,
  horaVespera: 18,
  timezone: FUSO_PADRAO,
};

/** Preferências da equipe (linha mais recente); cai no padrão se não houver. */
export async function prefsAgenda(): Promise<PrefsAgenda> {
  const { data } = await supabaseAdmin
    .from("wa_calendar_notify_prefs")
    .select("lembretes, hora_dia_inteiro, aviso_vespera, hora_vespera, timezone, ativo")
    .eq("ativo", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return PREFS_PADRAO;
  return {
    lembretes: (data.lembretes as number[] | null)?.length ? (data.lembretes as number[]) : PREFS_PADRAO.lembretes,
    horaDiaInteiro: data.hora_dia_inteiro ?? 8,
    avisoVespera: !!data.aviso_vespera,
    horaVespera: data.hora_vespera ?? 18,
    timezone: data.timezone || FUSO_PADRAO,
  };
}

/* ------------------------------------------------------------------ */
/* Fuso horário (respeita horário de verão de qualquer fuso)           */
/* ------------------------------------------------------------------ */

function deslocamentoMs(data: Date, tz: string): number {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .formatToParts(data)
    .reduce<Record<string, string>>((acc, x) => ({ ...acc, [x.type]: x.value }), {});
  const comoUtc = Date.UTC(
    Number(p['year']),
    Number(p['month']) - 1,
    Number(p['day']),
    Number(p['hour']) === 24 ? 0 : Number(p['hour']),
    Number(p['minute']),
    Number(p['second']),
  );
  return comoUtc - data.getTime();
}

/** Converte um horário local ("2026-08-04", 8h00) daquele fuso para UTC. */
export function localParaUtc(dia: string, hora: number, minuto: number, tz: string): Date {
  const [a, m, d] = dia.split("-").map(Number);
  const palpite = Date.UTC(a!, (m ?? 1) - 1, d ?? 1, hora, minuto, 0);
  let quando = new Date(palpite - deslocamentoMs(new Date(palpite), tz));
  // segunda passada resolve viradas de horário de verão
  quando = new Date(palpite - deslocamentoMs(quando, tz));
  return quando;
}

/** Data local (YYYY-MM-DD) de um instante, no fuso informado. */
export function diaLocal(iso: string | Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/** Hora curta (14h30) no fuso do compromisso. */
export function horaLocal(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: tz, hour: "2-digit", minute: "2-digit" })
    .format(new Date(iso))
    .replace(":", "h");
}

/* ------------------------------------------------------------------ */
/* Cálculo dos lembretes                                               */
/* ------------------------------------------------------------------ */

export type EventoLembrete = {
  id: string;
  titulo: string;
  inicio: string;
  fim: string;
  dia_inteiro: boolean;
  timezone: string | null;
  reminder_minutes: number[] | null;
  notifications_enabled: boolean | null;
  start_date: string | null;
  deleted_at?: string | null;
};

export type LembreteCalculado = { scheduled_for: string; reminder_type: string };

/** Horários dos lembretes de um compromisso (somente os que ainda estão no futuro). */
export function calcularLembretes(ev: EventoLembrete, prefs: PrefsAgenda, agora = new Date()): LembreteCalculado[] {
  if (ev.notifications_enabled === false || ev.deleted_at) return [];
  const tz = ev.timezone || prefs.timezone || FUSO_PADRAO;
  const saida: LembreteCalculado[] = [];
  const futuro = (d: Date) => d.getTime() > agora.getTime() - 60_000;

  if (ev.dia_inteiro) {
    const dia = ev.start_date || diaLocal(ev.inicio, tz);
    const noDia = localParaUtc(dia, prefs.horaDiaInteiro, 0, tz);
    if (futuro(noDia)) saida.push({ scheduled_for: noDia.toISOString(), reminder_type: "dia_inteiro" });
    if (prefs.avisoVespera) {
      const vespera = new Date(localParaUtc(dia, prefs.horaVespera, 0, tz).getTime() - 24 * 3600_000);
      if (futuro(vespera)) saida.push({ scheduled_for: vespera.toISOString(), reminder_type: "vespera" });
    }
    return saida;
  }

  const minutos = (ev.reminder_minutes?.length ? ev.reminder_minutes : prefs.lembretes).slice(0, 8);
  const inicio = new Date(ev.inicio).getTime();
  for (const m of minutos) {
    if (!Number.isFinite(m) || m < 0) continue;
    const quando = new Date(inicio - m * 60_000);
    if (!futuro(quando)) continue;
    saida.push({ scheduled_for: quando.toISOString(), reminder_type: m === 0 ? "inicio" : `antes_${m}` });
  }
  return saida;
}

const CAMPOS =
  "id, titulo, inicio, fim, dia_inteiro, timezone, reminder_minutes, notifications_enabled, start_date, deleted_at";

/** Cancela os lembretes pendentes de um compromisso (edição, exclusão, cancelamento). */
export async function cancelarLembretes(eventId: string) {
  await supabaseAdmin
    .from("wa_calendar_notification_jobs")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("event_id", eventId)
    .in("status", ["pending", "processing"]);
}

/**
 * Recalcula a fila do compromisso: cancela os pendentes e cria os novos.
 * Lembretes já enviados continuam como "sent" e não são reenviados
 * (a chave de idempotência garante isso).
 */
export async function reagendarLembretes(eventId: string): Promise<number> {
  try {
    const { data } = await supabaseAdmin.from("wa_calendar_events").select(CAMPOS).eq("id", eventId).maybeSingle();
    const ev = data as EventoLembrete | null;
    if (!ev) return 0;

    await cancelarLembretes(eventId);
    const prefs = await prefsAgenda();
    const lembretes = calcularLembretes(ev, prefs);
    if (lembretes.length === 0) return 0;

    const linhas = lembretes.map((l) => ({
      event_id: eventId,
      user_id: null,
      scheduled_for: l.scheduled_for,
      reminder_type: l.reminder_type,
      status: "pending",
      idempotency_key: `calendar:${eventId}:todos:${l.scheduled_for}:${l.reminder_type}`,
      updated_at: new Date().toISOString(),
    }));

    // upsert pela chave: se já existe (inclusive já enviado), não duplica.
    const { error } = await supabaseAdmin
      .from("wa_calendar_notification_jobs")
      .upsert(linhas as never, { onConflict: "idempotency_key", ignoreDuplicates: true });
    if (error) console.warn("[agenda/lembretes] falha ao gravar jobs:", error.message);
    return linhas.length;
  } catch (err) {
    console.error("[agenda/lembretes] erro:", err);
    return 0;
  }
}
