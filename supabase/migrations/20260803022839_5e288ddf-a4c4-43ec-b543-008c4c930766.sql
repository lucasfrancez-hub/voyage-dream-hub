alter table public.wa_flight_quotes
  add column if not exists delivery_status text not null default 'pending',
  add column if not exists expected_options integer,
  add column if not exists delivered_options_count integer not null default 0,
  add column if not exists next_run_at timestamptz;

create index if not exists wa_flight_quotes_delivery_idx
  on public.wa_flight_quotes (delivery_status, cancelled_at, next_run_at);

create table if not exists public.wa_flight_quote_options (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.wa_flight_quotes(id) on delete cascade,
  conversation_id uuid not null,
  protocolo_id uuid,
  option_index integer not null,
  fingerprint text not null,
  delivery_status text not null default 'pending',
  claim_id text,
  claim_started_at timestamptz,
  claim_expires_at timestamptz,
  attempt_count integer not null default 0,
  last_attempt_at timestamptz,
  last_error text,
  delivered_at timestamptz,
  delivery_format text,
  provider_message_id text,
  next_run_at timestamptz,
  created_at timestamptz not null default now(),
  unique (quote_id, option_index)
);

create index if not exists wa_flight_quote_options_fila_idx
  on public.wa_flight_quote_options (delivery_status, next_run_at);
create index if not exists wa_flight_quote_options_quote_idx
  on public.wa_flight_quote_options (quote_id, option_index);

grant select on public.wa_flight_quote_options to authenticated;
grant all on public.wa_flight_quote_options to service_role;

alter table public.wa_flight_quote_options enable row level security;

create policy "Admins podem ver as opcoes de cotacao"
  on public.wa_flight_quote_options
  for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));