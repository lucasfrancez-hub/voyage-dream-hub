CREATE TABLE public.public_quotes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  quote_type TEXT NOT NULL CHECK (quote_type IN ('AIR_ONLY','TRIP_PACKAGE')),
  title TEXT NOT NULL,
  subtitle TEXT,
  origin TEXT,
  destination TEXT,
  start_date TEXT,
  end_date TEXT,
  passengers JSONB NOT NULL DEFAULT '{}'::jsonb,
  products JSONB NOT NULL DEFAULT '{}'::jsonb,
  payment JSONB NOT NULL DEFAULT '{}'::jsonb,
  totals JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary JSONB NOT NULL DEFAULT '[]'::jsonb,
  agent JSONB,
  extra JSONB NOT NULL DEFAULT '{}'::jsonb,
  valid_until TIMESTAMPTZ,
  public_notes TEXT,
  short_slug TEXT,
  short_url TEXT,
  order_id UUID,
  conversation_id UUID,
  quote_id UUID,
  option_index INTEGER,
  source TEXT NOT NULL DEFAULT 'SYSTEM',
  view_count INTEGER NOT NULL DEFAULT 0,
  last_viewed_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_public_quotes_order ON public.public_quotes(order_id);
CREATE INDEX idx_public_quotes_conversation ON public.public_quotes(conversation_id);
CREATE UNIQUE INDEX idx_public_quotes_option ON public.public_quotes(quote_id, option_index) WHERE quote_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.public_quotes TO authenticated;
GRANT ALL ON public.public_quotes TO service_role;
ALTER TABLE public.public_quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Equipe autenticada gerencia orcamentos publicos"
  ON public.public_quotes FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE TABLE public.public_quote_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  public_quote_id UUID NOT NULL REFERENCES public.public_quotes(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_public_quote_events_quote ON public.public_quote_events(public_quote_id);

GRANT SELECT ON public.public_quote_events TO authenticated;
GRANT ALL ON public.public_quote_events TO service_role;
ALTER TABLE public.public_quote_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Equipe autenticada le eventos de orcamento"
  ON public.public_quote_events FOR SELECT TO authenticated
  USING (true);

CREATE TRIGGER update_public_quotes_updated_at
  BEFORE UPDATE ON public.public_quotes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();