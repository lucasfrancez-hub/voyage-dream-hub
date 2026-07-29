UPDATE public.packages
SET supplier_name = 'FRT', updated_at = now()
WHERE supplier_name = 'Visual Turismo'
  AND kind = 'tour'
  AND date(created_at AT TIME ZONE 'America/Sao_Paulo') = DATE '2026-07-29';