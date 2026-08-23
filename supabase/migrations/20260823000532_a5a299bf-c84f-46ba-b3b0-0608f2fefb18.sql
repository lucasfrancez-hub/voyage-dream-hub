CREATE TABLE public.passhub_reserva_pax (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  localizador text NOT NULL,
  id_passagem bigint,
  ordem int NOT NULL DEFAULT 0,
  nome text NOT NULL,
  sobrenome text NOT NULL,
  documento_tipo text NOT NULL DEFAULT 'cpf',
  documento text NOT NULL DEFAULT '',
  nascimento date,
  genero text,
  tipo text,
  telefone text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX passhub_reserva_pax_localizador_idx ON public.passhub_reserva_pax (localizador);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.passhub_reserva_pax TO authenticated;
GRANT ALL ON public.passhub_reserva_pax TO service_role;
ALTER TABLE public.passhub_reserva_pax ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Equipe autenticada le passageiros" ON public.passhub_reserva_pax FOR SELECT TO authenticated USING (true);
CREATE POLICY "Equipe autenticada grava passageiros" ON public.passhub_reserva_pax FOR INSERT TO authenticated WITH CHECK (true);