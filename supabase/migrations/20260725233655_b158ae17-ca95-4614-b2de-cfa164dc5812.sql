
ALTER TABLE public.packages
  ADD COLUMN IF NOT EXISTS date_mode text NOT NULL DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS pricing_mode text NOT NULL DEFAULT 'per_occupancy',
  ADD COLUMN IF NOT EXISTS max_units integer NOT NULL DEFAULT 9;

ALTER TABLE public.packages
  DROP CONSTRAINT IF EXISTS packages_date_mode_check,
  ADD CONSTRAINT packages_date_mode_check CHECK (date_mode IN ('fixed','flexible'));

ALTER TABLE public.packages
  DROP CONSTRAINT IF EXISTS packages_pricing_mode_check,
  ADD CONSTRAINT packages_pricing_mode_check CHECK (pricing_mode IN ('per_occupancy','per_unit'));

ALTER TABLE public.packages
  DROP CONSTRAINT IF EXISTS packages_max_units_check,
  ADD CONSTRAINT packages_max_units_check CHECK (max_units BETWEEN 1 AND 99);
