
ALTER TABLE public.order_passengers
  ADD COLUMN IF NOT EXISTS doc_type text NOT NULL DEFAULT 'cpf',
  ADD COLUMN IF NOT EXISTS passport_number text,
  ADD COLUMN IF NOT EXISTS passport_issue_date date,
  ADD COLUMN IF NOT EXISTS passport_expiry_date date;

ALTER TABLE public.order_passengers
  ADD CONSTRAINT order_passengers_doc_type_check
  CHECK (doc_type IN ('cpf','passport'));
