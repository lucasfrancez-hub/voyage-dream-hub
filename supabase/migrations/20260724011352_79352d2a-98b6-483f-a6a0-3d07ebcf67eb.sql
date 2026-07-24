
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nfse_config TO authenticated;
GRANT ALL ON public.nfse_config TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nfse_emissoes TO authenticated;
GRANT ALL ON public.nfse_emissoes TO service_role;

GRANT EXECUTE ON FUNCTION public.nfse_next_rps(uuid) TO authenticated, service_role;
