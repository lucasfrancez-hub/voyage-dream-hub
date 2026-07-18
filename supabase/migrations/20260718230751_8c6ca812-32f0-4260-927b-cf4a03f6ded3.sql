
ALTER TABLE public.nfse_emissoes
  ADD COLUMN IF NOT EXISTS valor_deducoes numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS base_calculo numeric(14,2),
  ADD COLUMN IF NOT EXISTS valor_iss_retido numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_ir numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_inss numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_csll numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_cofins numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_pis numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS outras_retencoes numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tributos_federais numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tributos_estaduais numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tributos_municipais numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS desconto_incondicional numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS desconto_condicional numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_liquido numeric(14,2),
  ADD COLUMN IF NOT EXISTS credito_tributario numeric(14,2) NOT NULL DEFAULT 0;
