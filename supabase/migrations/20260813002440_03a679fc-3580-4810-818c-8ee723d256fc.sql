-- 1) Fila de candidatas descobertas
CREATE TABLE IF NOT EXISTS public.airfare_promo_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.airfare_promo_runs(id) ON DELETE CASCADE,
  signature text NOT NULL,
  scope text NOT NULL DEFAULT 'nacional',
  origin_iata text NOT NULL,
  origin_city text,
  destination_iata text NOT NULL,
  destination_city text,
  departure_date date NOT NULL,
  return_date date,
  priority integer NOT NULL DEFAULT 100,
  reference_source text NOT NULL DEFAULT 'melhores_destinos',
  reference_price numeric,
  reference_origin text,
  reference_destination text,
  reference_departure_date date,
  reference_return_date date,
  reference_collected_at timestamptz,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  last_error_step text,
  last_error_at timestamptz,
  processed_at timestamptz,
  promotion_id uuid REFERENCES public.airfare_promotions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS airfare_promo_candidates_run_sig
  ON public.airfare_promo_candidates(run_id, signature);
CREATE INDEX IF NOT EXISTS airfare_promo_candidates_status
  ON public.airfare_promo_candidates(run_id, status, priority);

GRANT SELECT ON public.airfare_promo_candidates TO authenticated;
GRANT ALL ON public.airfare_promo_candidates TO service_role;
ALTER TABLE public.airfare_promo_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins leem candidatas"
  ON public.airfare_promo_candidates FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER airfare_promo_candidates_touch
  BEFORE UPDATE ON public.airfare_promo_candidates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Histórico de preço
CREATE TABLE IF NOT EXISTS public.airfare_promo_price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id uuid NOT NULL REFERENCES public.airfare_promotions(id) ON DELETE CASCADE,
  old_price numeric,
  new_price numeric,
  reference_price numeric,
  reason text NOT NULL DEFAULT 'atualizacao',
  source text NOT NULL DEFAULT 'coleta',
  run_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS airfare_promo_price_history_promo
  ON public.airfare_promo_price_history(promotion_id, created_at DESC);

GRANT SELECT ON public.airfare_promo_price_history TO authenticated;
GRANT ALL ON public.airfare_promo_price_history TO service_role;
ALTER TABLE public.airfare_promo_price_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins leem historico de preco"
  ON public.airfare_promo_price_history FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 3) Referência MD + comparativo nas promoções
ALTER TABLE public.airfare_promotions
  ADD COLUMN IF NOT EXISTS reference_source text,
  ADD COLUMN IF NOT EXISTS reference_price numeric,
  ADD COLUMN IF NOT EXISTS reference_origin text,
  ADD COLUMN IF NOT EXISTS reference_destination text,
  ADD COLUMN IF NOT EXISTS reference_departure_date date,
  ADD COLUMN IF NOT EXISTS reference_return_date date,
  ADD COLUMN IF NOT EXISTS reference_collected_at timestamptz,
  ADD COLUMN IF NOT EXISTS price_difference numeric,
  ADD COLUMN IF NOT EXISTS price_difference_percent numeric,
  ADD COLUMN IF NOT EXISTS unavailable_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_run_id uuid;

-- 4) Métricas da execução
ALTER TABLE public.airfare_promo_runs
  ADD COLUMN IF NOT EXISTS phase text,
  ADD COLUMN IF NOT EXISTS discovered integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS validated integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS no_result integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS new_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expired_count integer NOT NULL DEFAULT 0;

-- 5) Novo horário da coleta: 06:00 e 12:00 BRT
SELECT cron.unschedule('airfare-promos-collect')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'airfare-promos-collect');

SELECT cron.schedule(
  'airfare-promos-collect',
  '0 9,15 * * *',
  $$
  SELECT net.http_post(
    url := 'https://pedidos.viaair.tur.br/api/public/hooks/airfare-promos',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"trigger":"cron"}'::jsonb
  );
  $$
);