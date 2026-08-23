CREATE TABLE public.passhub_reserva_extra (
  id_passagem BIGINT PRIMARY KEY,
  localizador TEXT,
  comissao_extra NUMERIC(12,2) NOT NULL DEFAULT 0,
  observacao TEXT,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.passhub_reserva_extra TO authenticated;
GRANT ALL ON public.passhub_reserva_extra TO service_role;

ALTER TABLE public.passhub_reserva_extra ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam comissao extra"
ON public.passhub_reserva_extra FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER passhub_reserva_extra_touch
BEFORE UPDATE ON public.passhub_reserva_extra
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();