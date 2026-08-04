CREATE TABLE public.chat_device_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  pin_hash text NOT NULL,
  label text,
  user_agent text,
  attempts int NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_used_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_device_sessions_user ON public.chat_device_sessions(user_id);

GRANT ALL ON public.chat_device_sessions TO service_role;
ALTER TABLE public.chat_device_sessions ENABLE ROW LEVEL SECURITY;