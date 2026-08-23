CREATE TABLE public.passhub_reserva_bilhete (
  id_passagem bigint PRIMARY KEY,
  localizador text,
  numeros jsonb NOT NULL DEFAULT '[]'::jsonb,
  encontrado boolean NOT NULL DEFAULT false,
  verificado_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.passhub_reserva_bilhete TO authenticated;
GRANT ALL ON public.passhub_reserva_bilhete TO service_role;
ALTER TABLE public.passhub_reserva_bilhete ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Equipe autenticada le bilhetes" ON public.passhub_reserva_bilhete FOR SELECT TO authenticated USING (true);
CREATE TRIGGER passhub_reserva_bilhete_touch BEFORE UPDATE ON public.passhub_reserva_bilhete FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();