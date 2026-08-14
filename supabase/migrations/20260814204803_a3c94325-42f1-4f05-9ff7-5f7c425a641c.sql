insert into public.extension_tokens (user_id, token_hash, label)
select id, '7a5346d5ca057c268a3157dde71aac09d689df88e785bfc58394f66e704ed573', 'AUDITORIA PLUGIN (temporário)'
from auth.users order by created_at limit 1;