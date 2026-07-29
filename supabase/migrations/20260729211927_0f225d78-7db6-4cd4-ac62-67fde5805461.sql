
-- 1. Storage: broadcast-media restrito a admin/marketing
drop policy if exists "broadcast_media_auth_read" on storage.objects;
drop policy if exists "broadcast_media_auth_write" on storage.objects;
drop policy if exists "broadcast_media_auth_update" on storage.objects;
drop policy if exists "broadcast_media_auth_delete" on storage.objects;

create policy "broadcast_media_staff_read" on storage.objects for select to authenticated
using (bucket_id = 'broadcast-media' and (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'marketing')));
create policy "broadcast_media_staff_write" on storage.objects for insert to authenticated
with check (bucket_id = 'broadcast-media' and (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'marketing')));
create policy "broadcast_media_staff_update" on storage.objects for update to authenticated
using (bucket_id = 'broadcast-media' and (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'marketing')))
with check (bucket_id = 'broadcast-media' and (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'marketing')));
create policy "broadcast_media_staff_delete" on storage.objects for delete to authenticated
using (bucket_id = 'broadcast-media' and (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'marketing')));

-- 2. instagram_accounts: esconder segredos de não-admins (column-level)
revoke all on public.instagram_accounts from authenticated;
grant select (id, ig_user_id, page_id, username, display_name, profile_picture_url, token_expires_at, is_default, active, created_at, updated_at)
  on public.instagram_accounts to authenticated;
grant all on public.instagram_accounts to service_role;

-- 3. monde_sync_state: escrita apenas admin (explícito, sem depender de default-deny)
grant select, insert, update, delete on public.monde_sync_state to authenticated;
grant all on public.monde_sync_state to service_role;
drop policy if exists "Admins write monde sync state" on public.monde_sync_state;
create policy "Admins write monde sync state" on public.monde_sync_state for all to authenticated
using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- 4. SECURITY DEFINER: remover EXECUTE desnecessário
revoke execute on function public.verify_protocol_hash(text) from anon, authenticated, public;
revoke execute on function public.nfse_next_rps(uuid) from anon, authenticated, public;
