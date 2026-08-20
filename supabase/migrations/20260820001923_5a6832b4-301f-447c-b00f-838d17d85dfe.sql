update public.packages p
set hotel_options = (
  select jsonb_agg(
    case when o ? 'hotel_name' and o->>'hotel_name' ~* '(fotos, compara|avaliações$)'
      then jsonb_set(o, '{hotel_name}', to_jsonb(initcap(regexp_replace(regexp_replace(o->>'hotel_name', '\s*[:–-]\s*(\d{4}\s+)?(fotos|comparaç|avaliaç|preços).*$', '', 'i'), '\s*\([^)]*\)\s*$', ''))))
      else o end
    order by ord
  )
  from jsonb_array_elements(p.hotel_options) with ordinality t(o, ord)
)
where jsonb_typeof(p.hotel_options) = 'array' and p.hotel_options::text ~* 'fotos, compara';