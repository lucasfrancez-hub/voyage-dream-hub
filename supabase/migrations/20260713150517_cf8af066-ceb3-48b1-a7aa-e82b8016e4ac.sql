
-- Sequence for human-visible person code
CREATE SEQUENCE IF NOT EXISTS public.people_code_seq START 1000;

-- Main people table
CREATE TABLE public.people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code bigint NOT NULL DEFAULT nextval('public.people_code_seq'),
  kind text NOT NULL CHECK (kind IN ('PF','PJ')),

  -- Identification
  name text NOT NULL,
  legal_name text,
  gender text,
  birth_date date,
  foundation_date date,

  -- Documents
  cpf text,
  cnpj text,
  rg text,
  passport_number text,
  passport_expiration date,
  state_registration text,
  municipal_registration text,

  -- Contact
  email text,
  phone text,
  mobile_phone text,
  business_phone text,
  website text,

  -- Address
  zip text,
  address text,
  number text,
  complement text,
  district text,
  city text,
  state text,
  country text,
  is_foreign boolean NOT NULL DEFAULT false,

  -- Extras
  notes text,
  seller_name text,
  charge_boleto_fee boolean NOT NULL DEFAULT false,
  monde_id text UNIQUE,

  -- Audit
  created_by uuid,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Cards linked to a person
CREATE TABLE public.people_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  nickname text,
  holder_name text,
  brand text,
  last4 text,
  expiry text, -- MM/YY
  is_travel_card boolean NOT NULL DEFAULT false,
  number_ciphertext text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Grants (internal users only, no anon)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.people TO authenticated;
GRANT ALL ON public.people TO service_role;
GRANT USAGE, SELECT, UPDATE ON SEQUENCE public.people_code_seq TO authenticated;
GRANT USAGE, SELECT, UPDATE ON SEQUENCE public.people_code_seq TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.people_cards TO authenticated;
GRANT ALL ON public.people_cards TO service_role;

-- RLS
ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.people_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal users manage people"
  ON public.people FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'user')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'user')
  );

CREATE POLICY "Internal users manage people_cards"
  ON public.people_cards FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'user')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'user')
  );

-- Indexes
CREATE INDEX people_name_lower_idx ON public.people (lower(name));
CREATE INDEX people_email_lower_idx ON public.people (lower(email));
CREATE INDEX people_cpf_idx ON public.people (cpf);
CREATE INDEX people_cnpj_idx ON public.people (cnpj);
CREATE INDEX people_kind_idx ON public.people (kind);
CREATE INDEX people_cards_person_idx ON public.people_cards (person_id);

-- updated_at triggers (reusing existing public.set_updated_at)
CREATE TRIGGER trg_people_set_updated_at
BEFORE UPDATE ON public.people
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_people_cards_set_updated_at
BEFORE UPDATE ON public.people_cards
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
