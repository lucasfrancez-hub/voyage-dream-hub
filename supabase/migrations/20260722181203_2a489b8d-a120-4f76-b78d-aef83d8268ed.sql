ALTER TABLE public.packages
  ADD COLUMN IF NOT EXISTS services JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.packages.services IS
  'Serviços extras do pacote. Formato: { seguro: { enabled, cobertura }, transfer: { enabled, sentido: in|out|in_out }, city_tour: { enabled, detalhe }, outros: string[] }';