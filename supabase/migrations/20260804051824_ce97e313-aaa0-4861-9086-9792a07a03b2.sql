ALTER TABLE public.wa_calendar_events
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  ADD COLUMN IF NOT EXISTS reminder_minutes integer[] NOT NULL DEFAULT ARRAY[15],
  ADD COLUMN IF NOT EXISTS notifications_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS end_date date,
  ADD COLUMN IF NOT EXISTS concluido_em timestamptz,
  ADD COLUMN IF NOT EXISTS notification_processed_at timestamptz;

ALTER TABLE public.wa_chat_push_subs
  ADD COLUMN IF NOT EXISTS pref_agenda boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.wa_calendar_notify_prefs (
  user_id uuid PRIMARY KEY,
  ativo boolean NOT NULL DEFAULT true,
  lembretes integer[] NOT NULL DEFAULT ARRAY[15],
  hora_dia_inteiro integer NOT NULL DEFAULT 8,
  aviso_vespera boolean NOT NULL DEFAULT false,
  hora_vespera integer NOT NULL DEFAULT 18,
  som boolean NOT NULL DEFAULT true,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_calendar_notify_prefs TO authenticated;
GRANT ALL ON public.wa_calendar_notify_prefs TO service_role;
ALTER TABLE public.wa_calendar_notify_prefs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own calendar notify prefs" ON public.wa_calendar_notify_prefs;
CREATE POLICY "own calendar notify prefs" ON public.wa_calendar_notify_prefs
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.wa_calendar_notification_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.wa_calendar_events(id) ON DELETE CASCADE,
  user_id uuid,
  scheduled_for timestamptz NOT NULL,
  reminder_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  idempotency_key text NOT NULL UNIQUE,
  processed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.wa_calendar_notification_jobs TO authenticated;
GRANT ALL ON public.wa_calendar_notification_jobs TO service_role;
ALTER TABLE public.wa_calendar_notification_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "calendar jobs read" ON public.wa_calendar_notification_jobs;
CREATE POLICY "calendar jobs read" ON public.wa_calendar_notification_jobs
  FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS wa_cal_jobs_pending_idx
  ON public.wa_calendar_notification_jobs (status, scheduled_for);
CREATE INDEX IF NOT EXISTS wa_cal_jobs_event_idx
  ON public.wa_calendar_notification_jobs (event_id);

CREATE OR REPLACE FUNCTION public.claim_calendar_jobs(p_limit integer DEFAULT 100)
RETURNS SETOF public.wa_calendar_notification_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- devolve jobs travados em processing há mais de 10 minutos para a fila
  UPDATE public.wa_calendar_notification_jobs
     SET status = 'pending', updated_at = now()
   WHERE status = 'processing'
     AND updated_at < now() - interval '10 minutes'
     AND attempts < 5;

  RETURN QUERY
  WITH c AS (
    SELECT id FROM public.wa_calendar_notification_jobs
     WHERE status = 'pending' AND scheduled_for <= now()
     ORDER BY scheduled_for
     LIMIT p_limit
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.wa_calendar_notification_jobs j
     SET status = 'processing', attempts = j.attempts + 1, updated_at = now()
    FROM c
   WHERE j.id = c.id
  RETURNING j.*;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'calendar-push') THEN
    PERFORM cron.unschedule('calendar-push');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'calendar-jobs') THEN
    PERFORM cron.unschedule('calendar-jobs');
  END IF;
  PERFORM cron.schedule(
    'calendar-jobs',
    '* * * * *',
    $cron$
    SELECT net.http_post(
      url := 'https://project--934759e1-0e4c-4b91-ab07-03e261d1e2af.lovable.app/api/public/hooks/calendar-jobs',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{}'::jsonb
    );
    $cron$
  );
END;
$$;