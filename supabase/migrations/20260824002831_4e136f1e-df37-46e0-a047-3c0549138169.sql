ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'gestor';

CREATE TABLE IF NOT EXISTS public.user_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, module_key)
);

GRANT SELECT ON public.user_modules TO authenticated;
GRANT ALL ON public.user_modules TO service_role;

ALTER TABLE public.user_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuário vê os próprios módulos"
  ON public.user_modules FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin gerencia módulos"
  ON public.user_modules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.passhub_reserva_extra
  ADD COLUMN IF NOT EXISTS criado_por uuid;

CREATE INDEX IF NOT EXISTS passhub_reserva_extra_criado_por_idx
  ON public.passhub_reserva_extra (criado_por);

CREATE OR REPLACE FUNCTION public.pode_ver_tudo(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role::text IN ('admin', 'gestor')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.tem_modulo(_user_id uuid, _modulo text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.pode_ver_tudo(_user_id) THEN
    RETURN true;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.user_modules
    WHERE user_id = _user_id AND module_key = _modulo
  );
END;
$$;