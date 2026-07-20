UPDATE public.packages
SET tripadvisor_photos = (
  SELECT jsonb_agg(to_jsonb(replace(u, '%2F', '/')))
  FROM jsonb_array_elements_text(tripadvisor_photos) AS u
)
WHERE tripadvisor_photos IS NOT NULL
  AND tripadvisor_photos::text LIKE '%\%2F%';