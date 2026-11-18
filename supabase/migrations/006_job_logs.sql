-- Hunting Fox: a step-by-step log for every job, so failures can be traced from /admin → Jobs → Log.
-- Run after 005_admin.sql.
create table if not exists public.job_logs (
  id bigserial primary key,
  job_id uuid not null references public.jobs(id) on delete cascade,
  at timestamptz not null default now(),
  level text not null default 'info' check (level in ('info','warn','error')),
  step text,
  msg text not null,
  ms int
);
create index if not exists job_logs_job_idx on public.job_logs(job_id, id);
alter table public.job_logs enable row level security;
