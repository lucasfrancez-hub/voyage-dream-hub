ALTER TABLE public.packages ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'package';
ALTER TABLE public.packages DROP CONSTRAINT IF EXISTS packages_kind_check;
ALTER TABLE public.packages ADD CONSTRAINT packages_kind_check CHECK (kind IN ('package','service','cruise'));
CREATE INDEX IF NOT EXISTS packages_kind_idx ON public.packages (kind);