-- PolyTag v0.5 migration
-- Adds Lost Mode while preserving all existing v0.4 data.

create table if not exists public.lost_reports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.app_users(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  last_seen_text varchar(160) not null,
  status text not null default 'OPEN'
    check (status in ('OPEN', 'CLOSED', 'CANCELLED')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists idx_lost_reports_owner_id
  on public.lost_reports(owner_id);
create index if not exists idx_lost_reports_item_id
  on public.lost_reports(item_id);
create index if not exists idx_lost_reports_status
  on public.lost_reports(status);
create index if not exists idx_lost_reports_created_at
  on public.lost_reports(created_at desc);

alter table public.lost_reports enable row level security;
