create table if not exists public.otp_inbox (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('whatsapp','sms','manual','api')),
  provider text,
  sender text,
  code text not null,
  hint text,
  received_at timestamptz not null default now(),
  consumed_at timestamptz,
  consumed_by uuid
);
create index if not exists otp_inbox_recebido_idx on public.otp_inbox (received_at desc);
grant all on public.otp_inbox to service_role;
alter table public.otp_inbox enable row level security;