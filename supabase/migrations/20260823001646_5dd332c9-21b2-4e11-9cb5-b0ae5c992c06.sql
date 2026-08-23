CREATE TABLE public.passhub_reserva_cancelada (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  localizador TEXT NOT NULL,
  id_passagem INTEGER,
  motivo TEXT,
  cancelado_por UUID,
  remoto_ok BOOLEAN NOT NULL DEFAULT false,
  detalhe TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX passhub_reserva_cancelada_loc_idx ON public.passhub_reserva_cancelada (localizador);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.passhub_reserva_cancelada TO authenticated;
GRANT ALL ON public.passhub_reserva_cancelada TO service_role;
ALTER TABLE public.passhub_reserva_cancelada ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth pode ver cancelamentos" ON public.passhub_reserva_cancelada FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth pode registrar cancelamentos" ON public.passhub_reserva_cancelada FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth pode atualizar cancelamentos" ON public.passhub_reserva_cancelada FOR UPDATE TO authenticated USING (true);