ALTER TABLE public.instagram_comments
  ADD COLUMN IF NOT EXISTS dm_text text,
  ADD COLUMN IF NOT EXISTS dm_scheduled_at timestamptz;

CREATE INDEX IF NOT EXISTS instagram_comments_dm_pending_idx
  ON public.instagram_comments (dm_scheduled_at)
  WHERE dm_scheduled_at IS NOT NULL AND auto_dm_sent_at IS NULL;

SELECT cron.schedule(
  'instagram-dm-queue',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--934759e1-0e4c-4b91-ab07-03e261d1e2af.lovable.app/api/public/hooks/instagram-dm-queue',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);