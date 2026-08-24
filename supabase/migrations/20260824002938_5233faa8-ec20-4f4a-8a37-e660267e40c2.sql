REVOKE EXECUTE ON FUNCTION public.pode_ver_tudo(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tem_modulo(uuid, text) FROM anon, authenticated;