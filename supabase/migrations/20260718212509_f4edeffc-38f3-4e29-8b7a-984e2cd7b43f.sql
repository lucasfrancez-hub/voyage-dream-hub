ALTER TABLE public.nfse_config
  ADD COLUMN IF NOT EXISTS codigo_tributario_nacional text;

UPDATE public.nfse_config
SET codigo_tributario_nacional = '090201',
    item_lista_servico = '090201',
    codigo_tributario_municipio = NULL,
    updated_at = now();