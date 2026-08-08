ALTER TABLE public.asaas_recebimentos
  ADD COLUMN IF NOT EXISTS fine_percent numeric(6,2),
  ADD COLUMN IF NOT EXISTS interest_percent numeric(6,2),
  ADD COLUMN IF NOT EXISTS composicao jsonb,
  ADD COLUMN IF NOT EXISTS person_id uuid REFERENCES public.people(id) ON DELETE SET NULL;