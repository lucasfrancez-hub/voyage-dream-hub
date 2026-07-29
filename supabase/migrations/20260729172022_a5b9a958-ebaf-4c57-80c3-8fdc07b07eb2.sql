UPDATE public.packages
SET supplier_name = 'FRT', updated_at = now()
WHERE supplier_name = 'Visual Turismo'
  AND kind = 'package'
  AND date(created_at AT TIME ZONE 'America/Sao_Paulo') = DATE '2026-07-28';

UPDATE public.packages
SET supplier_name = 'Visual Turismo', updated_at = now()
WHERE supplier_name = 'FRT'
  AND kind = 'tour'
  AND date(created_at AT TIME ZONE 'America/Sao_Paulo') IN (DATE '2026-07-28', DATE '2026-07-29');