UPDATE public.nfse_emissoes
SET status = 'emitida',
    data_emissao = COALESCE(data_emissao, '2026-07-18 22:50:54+00'::timestamptz),
    updated_at = now()
WHERE numero_rps = 121 AND numero_nfse = '116';