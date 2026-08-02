ALTER TABLE public.wa_messages
  ADD COLUMN IF NOT EXISTS is_revoked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_by text;

ALTER TABLE public.wa_messages
  DROP CONSTRAINT IF EXISTS wa_messages_revoked_by_check;

ALTER TABLE public.wa_messages
  ADD CONSTRAINT wa_messages_revoked_by_check
  CHECK (revoked_by IS NULL OR revoked_by IN ('customer', 'business'));

UPDATE public.wa_messages
SET is_revoked = true,
    revoked_at = COALESCE(revoked_at, deleted_at),
    revoked_by = COALESCE(revoked_by, CASE WHEN deleted_by_customer THEN 'customer' ELSE 'business' END)
WHERE deleted_at IS NOT NULL AND is_revoked = false;

CREATE INDEX IF NOT EXISTS wa_messages_revoked_idx
  ON public.wa_messages (conversation_id)
  WHERE is_revoked;