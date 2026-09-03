DROP POLICY IF EXISTS "Partners manage own order_items" ON public.order_items;
CREATE POLICY "Partners manage own order_items" ON public.order_items FOR ALL TO authenticated
USING (public.is_partner_order_owner(order_id)) WITH CHECK (public.is_partner_order_owner(order_id));

DROP POLICY IF EXISTS "Partners manage own order_passengers" ON public.order_passengers;
CREATE POLICY "Partners manage own order_passengers" ON public.order_passengers FOR ALL TO authenticated
USING (public.is_partner_order_owner(order_id)) WITH CHECK (public.is_partner_order_owner(order_id));

DROP POLICY IF EXISTS "Partners manage own order_payments" ON public.order_payments;
CREATE POLICY "Partners manage own order_payments" ON public.order_payments FOR ALL TO authenticated
USING (public.is_partner_order_owner(order_id)) WITH CHECK (public.is_partner_order_owner(order_id));

DROP POLICY IF EXISTS "Partners manage own order_item_passengers" ON public.order_item_passengers;
CREATE POLICY "Partners manage own order_item_passengers" ON public.order_item_passengers FOR ALL TO authenticated
USING (public.is_partner_order_owner(order_id)) WITH CHECK (public.is_partner_order_owner(order_id));

DROP POLICY IF EXISTS "Partners manage own order_item_financials" ON public.order_item_financials;
CREATE POLICY "Partners manage own order_item_financials" ON public.order_item_financials FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.order_items i WHERE i.id = order_item_financials.order_item_id AND public.is_partner_order_owner(i.order_id)))
WITH CHECK (EXISTS (SELECT 1 FROM public.order_items i WHERE i.id = order_item_financials.order_item_id AND public.is_partner_order_owner(i.order_id)));

DROP POLICY IF EXISTS "Partners manage own pedido_assinaturas" ON public.pedido_assinaturas;
CREATE POLICY "Partners manage own pedido_assinaturas" ON public.pedido_assinaturas FOR ALL TO authenticated
USING (public.is_partner_order_owner(pedido_id)) WITH CHECK (public.is_partner_order_owner(pedido_id));

DROP POLICY IF EXISTS "Partners manage own pedido_assinatura_signers" ON public.pedido_assinatura_signers;
CREATE POLICY "Partners manage own pedido_assinatura_signers" ON public.pedido_assinatura_signers FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.pedido_assinaturas a WHERE a.id = pedido_assinatura_signers.assinatura_id AND public.is_partner_order_owner(a.pedido_id)))
WITH CHECK (EXISTS (SELECT 1 FROM public.pedido_assinaturas a WHERE a.id = pedido_assinatura_signers.assinatura_id AND public.is_partner_order_owner(a.pedido_id)));

DROP POLICY IF EXISTS "Admins manage partner_agencies" ON public.partner_agencies;
CREATE POLICY "Admins manage partner_agencies" ON public.partner_agencies FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));