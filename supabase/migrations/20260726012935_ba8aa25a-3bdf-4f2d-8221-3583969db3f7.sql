create table if not exists public.short_links (
  slug text primary key,
  target_url text not null,
  label text,
  created_by uuid references auth.users(id) on delete set null,
  click_count integer not null default 0,
  created_at timestamptz not null default now(),
  last_click_at timestamptz
);

grant select, insert, update, delete on public.short_links to authenticated;
grant all on public.short_links to service_role;

alter table public.short_links enable row level security;

create policy "admins gerenciam short_links"
  on public.short_links
  for all
  to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create index if not exists short_links_created_at_idx on public.short_links (created_at desc);

create or replace function public.increment_short_link_click(p_slug text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.short_links
     set click_count = click_count + 1,
         last_click_at = now()
   where slug = p_slug;
$$;

grant execute on function public.increment_short_link_click(text) to anon, authenticated, service_role;