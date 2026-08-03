CREATE TABLE IF NOT EXISTS public.wa_calendar_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('titan','icloud','google')),
  nome text NOT NULL,
  cor text NOT NULL DEFAULT '#F26B1F',
  server_url text,
  username text,
  password text,
  calendar_url text,
  calendar_id text,
  calendar_nome text,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  ativo boolean NOT NULL DEFAULT true,
  visivel boolean NOT NULL DEFAULT true,
  padrao boolean NOT NULL DEFAULT false,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.wa_calendar_accounts TO service_role;
ALTER TABLE public.wa_calendar_accounts ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_wa_calendar_accounts_updated ON public.wa_calendar_accounts;
CREATE TRIGGER trg_wa_calendar_accounts_updated
  BEFORE UPDATE ON public.wa_calendar_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.wa_calendar_events
  ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.wa_calendar_accounts(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'titan';

CREATE INDEX IF NOT EXISTS idx_wa_calendar_events_account ON public.wa_calendar_events(account_id);

DO $$
DECLARE v_cfg record; v_id uuid;
BEGIN
  SELECT * INTO v_cfg FROM public.wa_calendar_config ORDER BY created_at LIMIT 1;
  IF FOUND AND v_cfg.username IS NOT NULL THEN
    INSERT INTO public.wa_calendar_accounts (provider, nome, cor, server_url, username, password, calendar_url, calendar_nome, ativo, visivel, padrao, last_sync_at)
    VALUES ('titan', COALESCE(v_cfg.calendar_nome, 'VIA AIR — Titan'), '#F26B1F', COALESCE(v_cfg.server_url,'https://dav.titan.email'), v_cfg.username, v_cfg.password, v_cfg.calendar_url, v_cfg.calendar_nome, COALESCE(v_cfg.ativo,true), true, true, v_cfg.last_sync_at)
    RETURNING id INTO v_id;
    UPDATE public.wa_calendar_events SET account_id = v_id, provider = 'titan' WHERE account_id IS NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wa_calendar_events_uid_key') THEN
    ALTER TABLE public.wa_calendar_events DROP CONSTRAINT wa_calendar_events_uid_key;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_calendar_events_account_uid
  ON public.wa_calendar_events(COALESCE(account_id, '00000000-0000-0000-0000-000000000000'::uuid), uid);