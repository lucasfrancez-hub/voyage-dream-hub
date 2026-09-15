ALTER TABLE public.wa_conversations
  ADD COLUMN IF NOT EXISTS agent_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS agent_state_protocol_id uuid;

CREATE TABLE IF NOT EXISTS public.n8n_agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL UNIQUE,
  conversation_id uuid NOT NULL REFERENCES public.wa_conversations(id) ON DELETE CASCADE,
  protocol_id uuid,
  message_id uuid,
  agent_slug text,
  agent_role text,
  channel text,
  status text NOT NULL DEFAULT 'pending',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer,
  n8n_execution_id text,
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  state_update jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS n8n_agent_runs_conversation_idx ON public.n8n_agent_runs (conversation_id, started_at DESC);
CREATE INDEX IF NOT EXISTS n8n_agent_runs_status_idx ON public.n8n_agent_runs (status, started_at DESC);

GRANT SELECT ON public.n8n_agent_runs TO authenticated;
GRANT ALL ON public.n8n_agent_runs TO service_role;

ALTER TABLE public.n8n_agent_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Equipe autenticada lê os turnos do n8n"
ON public.n8n_agent_runs FOR SELECT TO authenticated USING (true);

CREATE TRIGGER update_n8n_agent_runs_updated_at
BEFORE UPDATE ON public.n8n_agent_runs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();