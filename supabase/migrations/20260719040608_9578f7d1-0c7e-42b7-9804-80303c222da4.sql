ALTER FUNCTION public._iata_city(text) SET search_path = public;

DROP POLICY IF EXISTS "auth read nfse" ON public.nfse_emissoes;
CREATE POLICY "auth read nfse" ON public.nfse_emissoes
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = nfse_emissoes.order_id
        AND o.owner_user_id = auth.uid()
    )
  );