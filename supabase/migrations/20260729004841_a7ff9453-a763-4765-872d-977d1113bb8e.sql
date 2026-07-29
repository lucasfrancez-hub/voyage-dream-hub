UPDATE public.packages
SET services = coalesce(services, '{}'::jsonb) || jsonb_build_object(
  'age_policy', jsonb_build_object(
    'free_max_age', 2,
    'fee_min_age', 3,
    'fee_max_age', 9,
    'fee_amount', 1.00,
    'fee_currency', 'US$',
    'adult_min_age', 10
  )
),
updated_at = now()
WHERE id = '529b2e5a-c209-4d9d-b561-4c3685e62c17';