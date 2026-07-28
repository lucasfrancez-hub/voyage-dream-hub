ALTER TABLE public.packages
  ADD COLUMN IF NOT EXISTS meeting_point text,
  ADD COLUMN IF NOT EXISTS tour_times text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS tour_modalities text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS ai_summary text;

ALTER TABLE public.package_date_prices
  ADD COLUMN IF NOT EXISTS modality text NOT NULL DEFAULT '';

ALTER TABLE public.package_date_prices
  DROP CONSTRAINT IF EXISTS package_date_prices_package_id_date_key;

CREATE UNIQUE INDEX IF NOT EXISTS package_date_prices_pkg_date_modality_key
  ON public.package_date_prices (package_id, date, modality);