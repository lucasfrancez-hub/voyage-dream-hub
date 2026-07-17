-- Restrict pending_authorization_signatures: only service_role (via supabaseAdmin) can access
DROP POLICY IF EXISTS "Anyone can insert pending signatures" ON public.pending_authorization_signatures;
DROP POLICY IF EXISTS "Anyone can read pending signatures" ON public.pending_authorization_signatures;

-- Restrict ai_agents SELECT to admins only (upsert already admin-only via ALL policy)
DROP POLICY IF EXISTS "Autenticados leem agentes" ON public.ai_agents;