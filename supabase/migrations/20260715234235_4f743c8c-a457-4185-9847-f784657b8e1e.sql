CREATE TABLE public.pending_authorization_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clicksign_document_key text NOT NULL UNIQUE,
  clicksign_signer_key text NOT NULL,
  clicksign_request_signature_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','signed','refused','canceled','consumed')),
  signed_pdf_path text,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  consumed_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  signed_at timestamptz,
  raw_last_event jsonb
);

GRANT SELECT, INSERT ON public.pending_authorization_signatures TO anon;
GRANT SELECT, INSERT ON public.pending_authorization_signatures TO authenticated;
GRANT ALL ON public.pending_authorization_signatures TO service_role;

ALTER TABLE public.pending_authorization_signatures ENABLE ROW LEVEL SECURITY;

-- Anyone can insert (public flow) — the ClickSign document key is generated server-side
CREATE POLICY "Anyone can insert pending signatures"
  ON public.pending_authorization_signatures
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Anyone can read pending signatures (used for polling status by id)
CREATE POLICY "Anyone can read pending signatures"
  ON public.pending_authorization_signatures
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Only service_role can update/delete (webhook + order consumption)
-- (no policy for UPDATE/DELETE = blocked for anon/authenticated)

CREATE TRIGGER pending_authorization_signatures_updated_at
  BEFORE UPDATE ON public.pending_authorization_signatures
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_pending_auth_sig_doc_key ON public.pending_authorization_signatures(clicksign_document_key);
CREATE INDEX idx_pending_auth_sig_status ON public.pending_authorization_signatures(status);
