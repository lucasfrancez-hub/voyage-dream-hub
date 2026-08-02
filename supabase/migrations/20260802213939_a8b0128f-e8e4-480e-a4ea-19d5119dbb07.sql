ALTER TABLE public.wa_messages ADD COLUMN IF NOT EXISTS delivery_status text;
ALTER TABLE public.wa_messages ADD COLUMN IF NOT EXISTS delivery_status_at timestamptz;