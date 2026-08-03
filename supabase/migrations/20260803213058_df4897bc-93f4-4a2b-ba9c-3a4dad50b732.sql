DROP INDEX IF EXISTS idx_wa_calendar_events_account_uid;
CREATE UNIQUE INDEX IF NOT EXISTS wa_calendar_events_account_uid_key
  ON public.wa_calendar_events (account_id, uid);