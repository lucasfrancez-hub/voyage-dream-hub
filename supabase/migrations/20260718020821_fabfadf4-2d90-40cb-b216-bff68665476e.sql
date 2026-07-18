-- 1) Extra columns on people
ALTER TABLE public.people
  ADD COLUMN IF NOT EXISTS marital_status text,
  ADD COLUMN IF NOT EXISTS birth_place text,
  ADD COLUMN IF NOT EXISTS rg_issuer text,
  ADD COLUMN IF NOT EXISTS rg_issued_at date,
  ADD COLUMN IF NOT EXISTS birth_certificate text,
  ADD COLUMN IF NOT EXISTS mother_name text;

-- 2) Extra columns on people_cards
ALTER TABLE public.people_cards
  ADD COLUMN IF NOT EXISTS operator text,
  ADD COLUMN IF NOT EXISTS travel_card_type text,
  ADD COLUMN IF NOT EXISTS security_code_hint text;

-- 3) people_phones
CREATE TABLE IF NOT EXISTS public.people_phones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'personal',
  number text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  notes text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.people_phones TO authenticated;
GRANT ALL ON public.people_phones TO service_role;
ALTER TABLE public.people_phones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "internal manage people_phones" ON public.people_phones
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'user'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'user'));
CREATE INDEX IF NOT EXISTS people_phones_person_idx ON public.people_phones(person_id);
CREATE TRIGGER trg_people_phones_updated BEFORE UPDATE ON public.people_phones
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4) people_emails
CREATE TABLE IF NOT EXISTS public.people_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'personal',
  address text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  notes text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.people_emails TO authenticated;
GRANT ALL ON public.people_emails TO service_role;
ALTER TABLE public.people_emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "internal manage people_emails" ON public.people_emails
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'user'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'user'));
CREATE INDEX IF NOT EXISTS people_emails_person_idx ON public.people_emails(person_id);
CREATE TRIGGER trg_people_emails_updated BEFORE UPDATE ON public.people_emails
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5) people_tags (marcadores)
CREATE TABLE IF NOT EXISTS public.people_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  label text NOT NULL,
  color text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.people_tags TO authenticated;
GRANT ALL ON public.people_tags TO service_role;
ALTER TABLE public.people_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "internal manage people_tags" ON public.people_tags
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'user'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'user'));
CREATE INDEX IF NOT EXISTS people_tags_person_idx ON public.people_tags(person_id);

-- 6) people_attachments
CREATE TABLE IF NOT EXISTS public.people_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  description text NOT NULL,
  mime_type text,
  storage_path text NOT NULL,
  size_bytes bigint,
  uploaded_by uuid,
  uploaded_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.people_attachments TO authenticated;
GRANT ALL ON public.people_attachments TO service_role;
ALTER TABLE public.people_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "internal manage people_attachments" ON public.people_attachments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'user'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'user'));
CREATE INDEX IF NOT EXISTS people_attachments_person_idx ON public.people_attachments(person_id);

-- 7) people_custom_fields
CREATE TABLE IF NOT EXISTS public.people_custom_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  field_key text NOT NULL,
  field_value text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.people_custom_fields TO authenticated;
GRANT ALL ON public.people_custom_fields TO service_role;
ALTER TABLE public.people_custom_fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY "internal manage people_custom_fields" ON public.people_custom_fields
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'user'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'user'));
CREATE INDEX IF NOT EXISTS people_custom_fields_person_idx ON public.people_custom_fields(person_id);