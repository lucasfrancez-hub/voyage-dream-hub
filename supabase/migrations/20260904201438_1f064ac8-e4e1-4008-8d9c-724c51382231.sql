ALTER TABLE public.wa_ai_switch
  ADD COLUMN IF NOT EXISTS ai_silence_until timestamptz,
  ADD COLUMN IF NOT EXISTS wa_provider text NOT NULL DEFAULT 'meta';

UPDATE public.wa_ai_switch SET ai_silence_until = (date_trunc('day', (now() AT TIME ZONE 'America/Sao_Paulo')) + interval '1 day') AT TIME ZONE 'America/Sao_Paulo' WHERE id = 'global' AND ai_silence_until IS NULL;

CREATE TABLE IF NOT EXISTS public.wa_history_sync (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id text NOT NULL,
  wa_phone text NOT NULL,
  imported integer NOT NULL DEFAULT 0,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chat_id)
);

GRANT SELECT ON public.wa_history_sync TO authenticated;
GRANT ALL ON public.wa_history_sync TO service_role;
ALTER TABLE public.wa_history_sync ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Equipe autenticada le o historico sincronizado"
ON public.wa_history_sync FOR SELECT TO authenticated USING (true);