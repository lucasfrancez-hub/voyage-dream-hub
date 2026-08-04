REVOKE ALL ON FUNCTION public.claim_calendar_jobs(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_calendar_jobs(integer) TO service_role;