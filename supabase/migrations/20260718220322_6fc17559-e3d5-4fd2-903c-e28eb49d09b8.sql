ALTER TABLE public.nfse_config
  ADD COLUMN IF NOT EXISTS provedor text NOT NULL DEFAULT 'focus',
  ADD COLUMN IF NOT EXISTS ipm_codigo_servico text,
  ADD COLUMN IF NOT EXISTS ipm_codigo_atividade text,
  ADD COLUMN IF NOT EXISTS ipm_endpoint text NOT NULL DEFAULT 'https://nfse-paranavai.atende.net/atende.php?pg=rest&service=WNERestServiceNFSe&cidade=padrao';

UPDATE public.nfse_config
   SET provedor = 'atendenet',
       ipm_codigo_servico = '23015',
       ipm_codigo_atividade = COALESCE(ipm_codigo_atividade, '23015')
 WHERE cnpj = '56339877000166' OR cnpj = '56.339.877/0001-66';
