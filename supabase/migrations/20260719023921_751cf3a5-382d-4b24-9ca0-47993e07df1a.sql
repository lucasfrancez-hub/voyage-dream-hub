
-- Multi-prestador NFS-e
ALTER TABLE public.nfse_config
  ADD COLUMN IF NOT EXISTS nome_fantasia text,
  ADD COLUMN IF NOT EXISTS padrao boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS cert_pfx_base64 text,
  ADD COLUMN IF NOT EXISTS cert_password text,
  ADD COLUMN IF NOT EXISTS atendenet_usuario text,
  ADD COLUMN IF NOT EXISTS atendenet_password text;

-- Garante somente um prestador padrão
CREATE UNIQUE INDEX IF NOT EXISTS nfse_config_only_one_default
  ON public.nfse_config ((padrao)) WHERE padrao = true;

-- Marca o registro existente como padrão
UPDATE public.nfse_config SET padrao = true
  WHERE id = (SELECT id FROM public.nfse_config ORDER BY created_at LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM public.nfse_config WHERE padrao = true);

-- Snapshot do prestador na emissão + FK opcional
ALTER TABLE public.nfse_emissoes
  ADD COLUMN IF NOT EXISTS prestador_id uuid REFERENCES public.nfse_config(id),
  ADD COLUMN IF NOT EXISTS prestador jsonb;

-- Backfill prestador_id nas emissões existentes com o padrão atual
UPDATE public.nfse_emissoes
   SET prestador_id = (SELECT id FROM public.nfse_config WHERE padrao = true LIMIT 1)
 WHERE prestador_id IS NULL;

-- Atualiza função de próximo RPS para ser por prestador
CREATE OR REPLACE FUNCTION public.nfse_next_rps(_prestador_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_num integer;
BEGIN
  v_id := COALESCE(_prestador_id, (SELECT id FROM public.nfse_config WHERE padrao = true LIMIT 1));
  IF v_id IS NULL THEN
    v_id := (SELECT id FROM public.nfse_config ORDER BY created_at LIMIT 1);
  END IF;
  UPDATE public.nfse_config
     SET proximo_numero_rps = proximo_numero_rps + 1
   WHERE id = v_id
   RETURNING proximo_numero_rps - 1 INTO v_num;
  RETURN v_num;
END;
$$;
