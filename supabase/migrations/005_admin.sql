-- Hunting Fox: admin pages (removal requests done, people blocked from future scans).
-- Run after 004_providers_requests.sql.

alter table public.removal_requests add column if not exists removed_at timestamptz;
alter table public.removal_requests add column if not exists found_in int not null default 0;

-- People who asked to be removed: never shown to students again. Server only.
create table if not exists public.blocked_people (
  contact text primary key,          -- lower-cased LinkedIn URL part or email
  created_at timestamptz not null default now()
);
alter table public.blocked_people enable row level security;
