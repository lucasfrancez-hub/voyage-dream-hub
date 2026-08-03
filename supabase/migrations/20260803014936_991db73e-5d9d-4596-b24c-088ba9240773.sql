DROP POLICY "Equipe autenticada le o interruptor da IA" ON public.wa_ai_switch;
DROP POLICY "Equipe autenticada altera o interruptor da IA" ON public.wa_ai_switch;
DROP POLICY "Equipe autenticada cria o interruptor da IA" ON public.wa_ai_switch;

CREATE POLICY "Admin/partner podem ler o interruptor da IA"
ON public.wa_ai_switch FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'partner'::app_role));

CREATE POLICY "Admin/partner podem alterar o interruptor da IA"
ON public.wa_ai_switch FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'partner'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'partner'::app_role));

CREATE POLICY "Admin/partner podem criar o interruptor da IA"
ON public.wa_ai_switch FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'partner'::app_role));