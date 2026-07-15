
ALTER TABLE public.wa_conversations
  ADD COLUMN IF NOT EXISTS ai_debounce_until timestamptz;

CREATE INDEX IF NOT EXISTS idx_wa_conversations_debounce
  ON public.wa_conversations(ai_debounce_until)
  WHERE ai_debounce_until IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    CREATE EXTENSION pg_cron;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    CREATE EXTENSION pg_net;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ai-debounce-dispatch') THEN
    PERFORM cron.unschedule('ai-debounce-dispatch');
  END IF;

  PERFORM cron.schedule(
    'ai-debounce-dispatch',
    '30 seconds',
    $cron$
    SELECT net.http_post(
      url := 'https://project--934759e1-0e4c-4b91-ab07-03e261d1e2af.lovable.app/api/public/hooks/dispatch-ai-debounced',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{}'::jsonb
    );
    $cron$
  );
END $$;
