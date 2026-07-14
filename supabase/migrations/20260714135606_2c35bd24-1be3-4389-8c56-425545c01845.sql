
-- =====================================================================
-- 1) partner_agencies table
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.partner_agencies (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  agency_name   text NOT NULL,
  agency_email  text,
  agency_phone  text,
  agency_cnpj   text,
  logo_url      text,
  brand_primary text,
  brand_secondary text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_agencies TO authenticated;
GRANT ALL ON public.partner_agencies TO service_role;

ALTER TABLE public.partner_agencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage partner_agencies"
  ON public.partner_agencies FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Partner sees own agency"
  ON public.partner_agencies FOR SELECT
  USING (user_id = auth.uid());

CREATE TRIGGER trg_partner_agencies_updated_at
  BEFORE UPDATE ON public.partner_agencies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =====================================================================
-- 2) orders.owner_user_id
-- =====================================================================
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Backfill: pedidos existentes ficam com o admin principal (Lucas)
UPDATE public.orders
  SET owner_user_id = '32ce404b-5a8c-497c-ad8a-a5ec8e11dc1a'::uuid
  WHERE owner_user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_orders_owner_user_id ON public.orders(owner_user_id);

-- Trigger BEFORE INSERT: se owner_user_id vier null, usa auth.uid()
CREATE OR REPLACE FUNCTION public.trg_orders_set_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.owner_user_id IS NULL THEN
    NEW.owner_user_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_set_owner ON public.orders;
CREATE TRIGGER orders_set_owner
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_orders_set_owner();

-- =====================================================================
-- 3) Partner policies em orders (mantém as políticas atuais)
-- =====================================================================
CREATE POLICY "Partners view own orders"
  ON public.orders FOR SELECT
  USING (
    public.has_role(auth.uid(), 'partner')
    AND owner_user_id = auth.uid()
  );

CREATE POLICY "Partners update own orders"
  ON public.orders FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'partner')
    AND owner_user_id = auth.uid()
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'partner')
    AND owner_user_id = auth.uid()
  );

CREATE POLICY "Partners delete own orders"
  ON public.orders FOR DELETE
  USING (
    public.has_role(auth.uid(), 'partner')
    AND owner_user_id = auth.uid()
  );

-- =====================================================================
-- 4) Helper: ordem pertence ao usuário atual como parceiro?
-- =====================================================================
CREATE OR REPLACE FUNCTION public.is_partner_order_owner(_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = _order_id
      AND o.owner_user_id = auth.uid()
      AND public.has_role(auth.uid(), 'partner')
  );
$$;

REVOKE ALL ON FUNCTION public.is_partner_order_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_partner_order_owner(uuid) TO authenticated;

-- =====================================================================
-- 5) Partner policies em tabelas-filhas
-- =====================================================================
CREATE POLICY "Partners manage own order_items"
  ON public.order_items FOR ALL
  USING (public.is_partner_order_owner(order_id))
  WITH CHECK (public.is_partner_order_owner(order_id));

CREATE POLICY "Partners manage own order_passengers"
  ON public.order_passengers FOR ALL
  USING (public.is_partner_order_owner(order_id))
  WITH CHECK (public.is_partner_order_owner(order_id));

CREATE POLICY "Partners manage own order_item_passengers"
  ON public.order_item_passengers FOR ALL
  USING (public.is_partner_order_owner(order_id))
  WITH CHECK (public.is_partner_order_owner(order_id));

CREATE POLICY "Partners manage own order_payments"
  ON public.order_payments FOR ALL
  USING (public.is_partner_order_owner(order_id))
  WITH CHECK (public.is_partner_order_owner(order_id));

CREATE POLICY "Partners manage own order_item_financials"
  ON public.order_item_financials FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.order_items i
      WHERE i.id = order_item_id
        AND public.is_partner_order_owner(i.order_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.order_items i
      WHERE i.id = order_item_id
        AND public.is_partner_order_owner(i.order_id)
    )
  );

CREATE POLICY "Partners manage own pedido_assinaturas"
  ON public.pedido_assinaturas FOR ALL
  USING (public.is_partner_order_owner(pedido_id))
  WITH CHECK (public.is_partner_order_owner(pedido_id));

CREATE POLICY "Partners manage own pedido_assinatura_signers"
  ON public.pedido_assinatura_signers FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.pedido_assinaturas a
      WHERE a.id = assinatura_id
        AND public.is_partner_order_owner(a.pedido_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.pedido_assinaturas a
      WHERE a.id = assinatura_id
        AND public.is_partner_order_owner(a.pedido_id)
    )
  );
