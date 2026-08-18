ALTER TABLE public.installment_rules
  ADD COLUMN IF NOT EXISTS boleto_financiado_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS boleto_financiado_max integer,
  ADD COLUMN IF NOT EXISTS boleto_prepago_enabled boolean NOT NULL DEFAULT true;