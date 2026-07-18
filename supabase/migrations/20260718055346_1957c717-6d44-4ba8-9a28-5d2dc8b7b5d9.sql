
-- Categorias
CREATE TABLE public.financial_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('payable','receivable','both')),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_categories TO authenticated;
GRANT ALL ON public.financial_categories TO service_role;
ALTER TABLE public.financial_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manage categories" ON public.financial_categories
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

INSERT INTO public.financial_categories(kind,name) VALUES
  ('receivable','Venda de pacote'),
  ('receivable','Venda de aéreo'),
  ('receivable','Venda de hospedagem'),
  ('receivable','Venda de serviço'),
  ('receivable','Comissão recebida'),
  ('receivable','Outros'),
  ('payable','Fornecedor aéreo'),
  ('payable','Fornecedor hotel'),
  ('payable','Fornecedor serviço'),
  ('payable','Comissão a pagar'),
  ('payable','Marketing'),
  ('payable','Aluguel'),
  ('payable','Salários'),
  ('payable','Impostos'),
  ('payable','Software / assinaturas'),
  ('payable','Outros');

-- Lançamentos
CREATE TABLE public.financial_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('payable','receivable')),
  description text NOT NULL,
  category text,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  due_date date,
  paid_date date,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','canceled')),
  counterparty text,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  payment_method text,
  notes text,
  auto_generated boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_financial_entries_kind_status ON public.financial_entries(kind,status);
CREATE INDEX idx_financial_entries_due_date ON public.financial_entries(due_date);
CREATE INDEX idx_financial_entries_order_id ON public.financial_entries(order_id);
CREATE UNIQUE INDEX uniq_financial_entries_order_auto
  ON public.financial_entries(order_id) WHERE auto_generated = true AND order_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_entries TO authenticated;
GRANT ALL ON public.financial_entries TO service_role;
ALTER TABLE public.financial_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manage entries" ON public.financial_entries
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_financial_entries_updated
  BEFORE UPDATE ON public.financial_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Trigger que gera receivable automaticamente a partir dos pedidos
CREATE OR REPLACE FUNCTION public.trg_orders_sync_receivable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  snap jsonb;
  is_paid boolean;
  due date;
BEGIN
  snap := COALESCE(NEW.package_snapshot, '{}'::jsonb);
  -- pular payment_links puros
  IF snap ? 'kind' AND snap->>'kind' IN ('payment_link','payment_link_simple') THEN
    RETURN NEW;
  END IF;
  IF NEW.total_price IS NULL OR NEW.total_price <= 0 THEN
    RETURN NEW;
  END IF;

  is_paid := lower(COALESCE(NEW.status,'')) IN ('paid','approved');
  due := COALESCE(NULLIF(snap->>'going_date','')::date, (NEW.created_at + interval '7 days')::date);

  INSERT INTO public.financial_entries(
    kind, description, category, amount, due_date, paid_date, status,
    counterparty, order_id, auto_generated
  ) VALUES (
    'receivable',
    'Pedido #' || COALESCE(NEW.order_number, substr(NEW.id::text,1,8)) ||
      CASE WHEN NEW.full_name IS NOT NULL THEN ' — ' || NEW.full_name ELSE '' END,
    'Venda de pacote',
    NEW.total_price,
    due,
    CASE WHEN is_paid THEN COALESCE(NEW.created_at::date, CURRENT_DATE) ELSE NULL END,
    CASE WHEN is_paid THEN 'paid' ELSE 'pending' END,
    NEW.full_name,
    NEW.id,
    true
  )
  ON CONFLICT (order_id) WHERE auto_generated = true AND order_id IS NOT NULL
  DO UPDATE SET
    amount = EXCLUDED.amount,
    counterparty = EXCLUDED.counterparty,
    description = EXCLUDED.description,
    due_date = EXCLUDED.due_date,
    status = CASE
      WHEN public.financial_entries.status = 'canceled' THEN 'canceled'
      ELSE EXCLUDED.status
    END,
    paid_date = CASE
      WHEN EXCLUDED.status = 'paid' AND public.financial_entries.paid_date IS NULL
        THEN COALESCE(EXCLUDED.paid_date, CURRENT_DATE)
      WHEN EXCLUDED.status = 'pending' THEN NULL
      ELSE public.financial_entries.paid_date
    END,
    updated_at = now();

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_orders_sync_receivable_ins
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_orders_sync_receivable();

CREATE TRIGGER trg_orders_sync_receivable_upd
  AFTER UPDATE OF total_price, status, full_name, order_number, package_snapshot ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_orders_sync_receivable();

-- Backfill dos pedidos existentes
INSERT INTO public.financial_entries(
  kind, description, category, amount, due_date, paid_date, status,
  counterparty, order_id, auto_generated
)
SELECT
  'receivable',
  'Pedido #' || COALESCE(o.order_number, substr(o.id::text,1,8)) ||
    CASE WHEN o.full_name IS NOT NULL THEN ' — ' || o.full_name ELSE '' END,
  'Venda de pacote',
  o.total_price,
  COALESCE(
    NULLIF(o.package_snapshot->>'going_date','')::date,
    (o.created_at + interval '7 days')::date
  ),
  CASE WHEN lower(COALESCE(o.status,'')) IN ('paid','approved') THEN o.created_at::date ELSE NULL END,
  CASE WHEN lower(COALESCE(o.status,'')) IN ('paid','approved') THEN 'paid' ELSE 'pending' END,
  o.full_name,
  o.id,
  true
FROM public.orders o
WHERE o.total_price IS NOT NULL AND o.total_price > 0
  AND NOT (o.package_snapshot ? 'kind' AND o.package_snapshot->>'kind' IN ('payment_link','payment_link_simple'))
ON CONFLICT (order_id) WHERE auto_generated = true AND order_id IS NOT NULL DO NOTHING;
