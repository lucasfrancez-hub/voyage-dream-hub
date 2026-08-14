create table if not exists public.hotel_tripadvisor_links (
  id uuid primary key default gen_random_uuid(),
  hotel_key text not null unique,
  hotel_name text not null,
  city text,
  location_id bigint not null,
  location_name text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.hotel_tripadvisor_links to authenticated;
grant all on public.hotel_tripadvisor_links to service_role;
alter table public.hotel_tripadvisor_links enable row level security;
create policy "Equipe gerencia vinculos de hotel" on public.hotel_tripadvisor_links
  for all to authenticated using (true) with check (true);