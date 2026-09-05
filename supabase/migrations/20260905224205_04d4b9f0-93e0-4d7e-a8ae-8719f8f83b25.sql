CREATE TABLE public.card_3ds_validations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id text NOT NULL,
  stripe_payment_intent_id text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  three_ds_result text,
  authentication_flow text,
  card_brand text,
  card_last4 text,
  card_fingerprint text,
  authenticated_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_card_3ds_validations_reservation ON public.card_3ds_validations (reservation_id, created_at DESC);

GRANT SELECT ON public.card_3ds_validations TO authenticated;
GRANT ALL ON public.card_3ds_validations TO service_role;

ALTER TABLE public.card_3ds_validations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios autenticados podem ver validacoes 3DS"
  ON public.card_3ds_validations FOR SELECT TO authenticated USING (true);

CREATE TRIGGER trg_card_3ds_validations_updated
  BEFORE UPDATE ON public.card_3ds_validations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();