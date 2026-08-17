ALTER TABLE public.wa_conversations
  ADD COLUMN IF NOT EXISTS fraud_risk_max_score smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fraud_risk_confidence smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fraud_risk_trend text NOT NULL DEFAULT 'estavel',
  ADD COLUMN IF NOT EXISTS fraud_risk_velocity text NOT NULL DEFAULT 'leve',
  ADD COLUMN IF NOT EXISTS fraud_risk_persistence smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fraud_critical_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS fraud_score_at_transfer smallint,
  ADD COLUMN IF NOT EXISTS fraud_transfer_reason text,
  ADD COLUMN IF NOT EXISTS fraud_analysis_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS fraud_payment_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS fraud_manual_overrides jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS fraud_outcome text,
  ADD COLUMN IF NOT EXISTS fraud_outcome_at timestamptz,
  ADD COLUMN IF NOT EXISTS fraud_outcome_by uuid,
  ADD COLUMN IF NOT EXISTS fraud_outcome_note text;

ALTER TABLE public.wa_fraud_evaluations
  ADD COLUMN IF NOT EXISTS confidence_before smallint,
  ADD COLUMN IF NOT EXISTS confidence_after smallint,
  ADD COLUMN IF NOT EXISTS trend text,
  ADD COLUMN IF NOT EXISTS velocity text,
  ADD COLUMN IF NOT EXISTS max_score smallint,
  ADD COLUMN IF NOT EXISTS critical_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS transfer_reason text,
  ADD COLUMN IF NOT EXISTS note text;

CREATE TABLE IF NOT EXISTS public.wa_fraud_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.wa_conversations(id) ON DELETE CASCADE,
  kind text NOT NULL,
  score smallint,
  confidence smallint,
  level text,
  label text NOT NULL,
  detail text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.wa_fraud_events TO authenticated;
GRANT ALL ON public.wa_fraud_events TO service_role;
ALTER TABLE public.wa_fraud_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Equipe autenticada le eventos de risco" ON public.wa_fraud_events
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Equipe autenticada registra eventos de risco" ON public.wa_fraud_events
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE INDEX IF NOT EXISTS wa_fraud_events_conv_idx ON public.wa_fraud_events (conversation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.wa_fraud_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.wa_conversations(id) ON DELETE CASCADE,
  action text NOT NULL,
  signal_code text,
  note text,
  score_at_review smallint,
  reviewer uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.wa_fraud_reviews TO authenticated;
GRANT ALL ON public.wa_fraud_reviews TO service_role;
ALTER TABLE public.wa_fraud_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Equipe autenticada le revisoes de risco" ON public.wa_fraud_reviews
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Equipe autenticada registra revisoes de risco" ON public.wa_fraud_reviews
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE INDEX IF NOT EXISTS wa_fraud_reviews_conv_idx ON public.wa_fraud_reviews (conversation_id, created_at DESC);