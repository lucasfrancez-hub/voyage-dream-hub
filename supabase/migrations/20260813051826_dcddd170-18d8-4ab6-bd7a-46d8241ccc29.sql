ALTER TABLE public.airfare_promotions DROP CONSTRAINT IF EXISTS airfare_promotions_status_check;
ALTER TABLE public.airfare_promotions ADD CONSTRAINT airfare_promotions_status_check
  CHECK (status = ANY (ARRAY['novo'::text,'selecionado'::text,'agendado'::text,'publicado'::text,'descartado'::text]));