DROP POLICY IF EXISTS "Equipe autenticada gerencia solicitacoes aereas" ON public.wa_flight_search_requests;

CREATE POLICY "Admin/partner leem solicitacoes aereas"
ON public.wa_flight_search_requests
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'partner'::app_role));

CREATE POLICY "Admin/partner gerenciam solicitacoes aereas"
ON public.wa_flight_search_requests
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));