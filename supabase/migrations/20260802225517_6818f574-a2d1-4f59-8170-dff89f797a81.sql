-- Memória de referência para hotéis e pacotes + estrutura futura de franquia de bagagem
ALTER TABLE public.wa_conversations
  ADD COLUMN IF NOT EXISTS ultima_referencia_source text,
  ADD COLUMN IF NOT EXISTS ultima_referencia_assunto text,
  ADD COLUMN IF NOT EXISTS ultima_companhia_referenciada text,
  ADD COLUMN IF NOT EXISTS ultima_opcao_hotel_referenciada jsonb,
  ADD COLUMN IF NOT EXISTS ultimo_pacote_referenciado jsonb;

ALTER TABLE public.wa_messages
  ADD COLUMN IF NOT EXISTS product_id text,
  ADD COLUMN IF NOT EXISTS product_option_index integer;

CREATE INDEX IF NOT EXISTS wa_messages_product_idx
  ON public.wa_messages (conversation_id, product_type, created_at DESC);

CREATE TABLE IF NOT EXISTS public.airline_baggage_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  airline_code text NOT NULL,
  fare_family text,
  route_type text,
  checked_baggage_pieces integer,
  checked_baggage_weight integer,
  carry_on_weight integer,
  carry_on_dimensions text,
  personal_item_rules text,
  source text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.airline_baggage_rules TO authenticated;
GRANT ALL ON public.airline_baggage_rules TO service_role;
ALTER TABLE public.airline_baggage_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Equipe autenticada le regras de bagagem"
  ON public.airline_baggage_rules FOR SELECT TO authenticated USING (true);