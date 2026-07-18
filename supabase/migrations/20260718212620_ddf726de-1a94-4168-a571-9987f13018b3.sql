ALTER TABLE public.nfse_config
  ADD COLUMN IF NOT EXISTS cep text,
  ADD COLUMN IF NOT EXISTS logradouro text,
  ADD COLUMN IF NOT EXISTS numero text,
  ADD COLUMN IF NOT EXISTS bairro text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS telefone text;

UPDATE public.nfse_config
SET cep = '87707120',
    logradouro = COALESCE(logradouro, 'RUA TAKESHI MITSUYASU'),
    numero = COALESCE(numero, '355'),
    bairro = COALESCE(bairro, 'JARDIM PANORAMA'),
    email = COALESCE(email, 'lucas@voeair.com'),
    municipio_prestacao = COALESCE(municipio_prestacao, 'PARANAVAI'),
    uf_prestacao = COALESCE(uf_prestacao, 'PR'),
    updated_at = now();