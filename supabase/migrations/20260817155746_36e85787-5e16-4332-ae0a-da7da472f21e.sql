alter table public.wa_conversations
  add column if not exists fraud_risk_score smallint not null default 0,
  add column if not exists fraud_risk_level text not null default 'baixo',
  add column if not exists fraud_signals jsonb not null default '[]'::jsonb,
  add column if not exists fraud_clusters jsonb not null default '[]'::jsonb,
  add column if not exists fraud_reducers jsonb not null default '[]'::jsonb,
  add column if not exists fraud_summary text,
  add column if not exists fraud_last_evaluation timestamptz,
  add column if not exists fraud_transfer_required boolean not null default false,
  add column if not exists fraud_transfer_at timestamptz;

create table if not exists public.wa_fraud_evaluations (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.wa_conversations(id) on delete cascade,
  message_id uuid,
  risk_before smallint,
  risk_after smallint not null,
  level_before text,
  level_after text not null,
  signals_added jsonb not null default '[]'::jsonb,
  signals_removed jsonb not null default '[]'::jsonb,
  reducers_added jsonb not null default '[]'::jsonb,
  clusters_detected jsonb not null default '[]'::jsonb,
  signals_snapshot jsonb not null default '[]'::jsonb,
  summary text,
  source text not null default 'auto',
  transfer_triggered boolean not null default false,
  evaluated_at timestamptz not null default now()
);

create index if not exists wa_fraud_evaluations_conv_idx
  on public.wa_fraud_evaluations (conversation_id, evaluated_at desc);

grant select on public.wa_fraud_evaluations to authenticated;
grant all on public.wa_fraud_evaluations to service_role;

alter table public.wa_fraud_evaluations enable row level security;

drop policy if exists "Equipe interna lê avaliações antifraude" on public.wa_fraud_evaluations;
create policy "Equipe interna lê avaliações antifraude"
  on public.wa_fraud_evaluations
  for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));