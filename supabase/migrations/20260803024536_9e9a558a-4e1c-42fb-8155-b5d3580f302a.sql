DROP POLICY "Equipe autenticada gerencia fluxos" ON public.wa_flows;

CREATE POLICY "Admin/partner gerencia fluxos"
  ON public.wa_flows FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'partner'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'partner'::app_role));