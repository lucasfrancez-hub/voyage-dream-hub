REVOKE ALL ON FUNCTION public.nfse_next_rps(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nfse_next_rps(uuid) TO authenticated, service_role;