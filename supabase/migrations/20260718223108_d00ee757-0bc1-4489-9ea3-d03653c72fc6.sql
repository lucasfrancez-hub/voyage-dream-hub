UPDATE public.nfse_config
SET proximo_numero_rps = 116,
    serie_rps = '1'
WHERE proximo_numero_rps > 116
  AND NOT EXISTS (
    SELECT 1
    FROM public.nfse_emissoes
    WHERE numero_rps >= 116
      AND status = 'emitida'
  );