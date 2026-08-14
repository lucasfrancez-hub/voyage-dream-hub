update public.extension_tokens set revoked_at = now()
where token_hash = '7a5346d5ca057c268a3157dde71aac09d689df88e785bfc58394f66e704ed573';
delete from public.quote_options where quote_id in (select id from public.quotes where title = '404');
delete from public.quote_imports where source_url like '%auditoria-teste-001%';
delete from public.quotes where title = '404';