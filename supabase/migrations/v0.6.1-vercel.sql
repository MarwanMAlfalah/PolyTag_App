-- PolyTag v0.6.1: persist temporary bot conversation state for serverless/webhook hosting.
-- Safe to run on the existing database. It does not delete existing data.

create table if not exists public.bot_states (
  telegram_user_id bigint primary key,
  state jsonb not null,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  updated_at timestamptz not null default now()
);

create index if not exists bot_states_expires_at_idx
  on public.bot_states (expires_at);

alter table public.bot_states enable row level security;

comment on table public.bot_states is
  'Short-lived Telegram conversation state used by PolyTag webhook/serverless deployments.';
