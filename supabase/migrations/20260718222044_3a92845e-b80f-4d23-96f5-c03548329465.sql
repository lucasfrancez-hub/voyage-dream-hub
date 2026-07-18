
ALTER TABLE public.nfse_config
  ADD COLUMN IF NOT EXISTS proximo_numero_rps INTEGER NOT NULL DEFAULT 113,
  ADD COLUMN IF NOT EXISTS serie_rps TEXT NOT NULL DEFAULT 'RPS';

UPDATE public.nfse_config SET proximo_numero_rps = 113 WHERE proximo_numero_rps < 113;

ALTER TABLE public.nfse_emissoes
  ADD COLUMN IF NOT EXISTS numero_rps INTEGER;

CREATE OR REPLACE FUNCTION public.nfse_next_rps()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_num INTEGER;
BEGIN
  UPDATE public.nfse_config
     SET proximo_numero_rps = proximo_numero_rps + 1
   WHERE id = (SELECT id FROM public.nfse_config ORDER BY created_at LIMIT 1)
   RETURNING proximo_numero_rps - 1 INTO v_num;
  RETURN v_num;
END;
$$;

REVOKE ALL ON FUNCTION public.nfse_next_rps() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nfse_next_rps() TO authenticated, service_role;
