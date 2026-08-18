CREATE TABLE public.installment_rules (
  id uuid primary key default gen_random_uuid(),
  operator_label text not null,
  match_pattern text not null,
  max_installments integer not null default 10,
  limited_brands text[] not null default '{}',
  limited_brands_max integer,
  valid_from date,
  valid_until date,
  priority integer not null default 0,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

GRANT SELECT ON public.installment_rules TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.installment_rules TO authenticated;
GRANT ALL ON public.installment_rules TO service_role;

ALTER TABLE public.installment_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "installment_rules_public_read"
ON public.installment_rules FOR SELECT
TO anon, authenticated
USING (is_active = true);

CREATE POLICY "installment_rules_admin_all"
ON public.installment_rules FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER installment_rules_touch
BEFORE UPDATE ON public.installment_rules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.installment_rules (operator_label, match_pattern, max_installments, limited_brands, limited_brands_max, valid_until, priority, notes)
VALUES
  ('FRT', 'frt', 15, '{}', NULL, '2026-08-31', 10, 'Campanha 15x sem juros até 31/08/2026'),
  ('Cativa / Viajando com Desconto', 'cativa|viajando com desconto', 10, '{Hipercard,Diners,Elo,Amex}', 6, NULL, 5, 'Bandeiras restritas em até 6x');