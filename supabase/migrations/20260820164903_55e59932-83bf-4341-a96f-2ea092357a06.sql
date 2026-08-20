UPDATE public.public_quotes
SET destination = COALESCE(NULLIF(public._iata_city(destination), ''), destination)
WHERE destination ~ '^[A-Z]{3}$';