update public.packages
set hotel_name = initcap(regexp_replace(regexp_replace(hotel_name, '\s*[:–-]\s*(\d{4}\s+)?(fotos|comparaç|avaliaç|preços).*$', '', 'i'), '\s*\([^)]*\)\s*$', ''))
where hotel_name ~* '(fotos, compara|avaliações$)';