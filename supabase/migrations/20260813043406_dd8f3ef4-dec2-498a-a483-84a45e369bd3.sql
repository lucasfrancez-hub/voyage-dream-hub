CREATE TABLE IF NOT EXISTS public.md_response_cache (
  url_hash text PRIMARY KEY,
  url text NOT NULL,
  payload jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS md_response_cache_fetched_at_idx ON public.md_response_cache (fetched_at DESC);
GRANT ALL ON public.md_response_cache TO service_role;
ALTER TABLE public.md_response_cache ENABLE ROW LEVEL SECURITY;