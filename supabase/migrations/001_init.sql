-- Hunting Fox: initial schema. Run in the Supabase SQL editor (or `supabase db push`).

create extension if not exists pgcrypto;

-- One row per student. Filled on first sign-in by the trigger below.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  email text,
  -- Active resume (confirmed by the student)
  resume_path text,
  resume_text text,          -- clean lines, one per line, used for the diff
  resume_profile jsonb,      -- short profile from AI: {headline, summary, skills[], projects[], education[]}
  resume_added_at timestamptz,
  -- Waiting for "Did we read your resume correctly?"
  pending_resume_path text,
  pending_resume_text text,
  pending_resume_profile jsonb,
  -- Account page
  skills jsonb not null default '[]',      -- [{name, level 1-5, from_job}]
  links jsonb not null default '[]',       -- [{label, url}]
  education jsonb not null default '[]',   -- [{school, what, from, to}]
  email_ready boolean not null default true,
  email_reminders boolean not null default true,
  created_at timestamptz not null default now()
);

-- One row per pasted job link. Each job is processed on its own.
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  url text not null,
  portal text not null check (portal in ('linkedin','naukri')),
  status text not null default 'queued'
    check (status in ('queued','scanning','ready','failed','closed','fake','agency')),
  step int not null default 0,          -- 0..5 for the progress popup
  step_detail text,
  error text,
  attempts int not null default 0,
  -- Tracker
  apply_status text check (apply_status in ('applied','no_reply','replied','interview','got_job','not_selected','not_applying')),
  applied_at timestamptz,
  opened_posting_at timestamptz,
  sent_to jsonb not null default '[]',  -- people ids the student marked "I sent it"
  title text,
  company text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (user_id, url)
);
create index if not exists jobs_user_idx on public.jobs(user_id, created_at desc);

-- Everything we found for a job.
create table if not exists public.reports (
  job_id uuid primary key references public.jobs(id) on delete cascade,
  job_data jsonb,
  company_data jsonb,
  checks jsonb,          -- [{group, text, result}]
  verdict text,          -- genuine | unverified | fake | agency | closed
  size_band text,        -- small | big
  people jsonb,          -- ranked, cleaned people with messages
  resume jsonb,          -- {base_lines[], edits[], skill_questions[], suggestions[]}
  share_token text unique default encode(gen_random_bytes(9), 'hex'),
  created_at timestamptz not null default now()
);

-- Company + people cache, shared across students (server only).
create table if not exists public.company_cache (
  key text primary key,
  company_data jsonb,
  people jsonb,
  ranking jsonb,
  fetched_at timestamptz not null default now()
);

-- Apify token pool state (server only). Tokens themselves live in env APIFY_TOKENS.
create table if not exists public.apify_tokens (
  label text primary key,
  exhausted boolean not null default false,
  rows_used_month int not null default 0,
  remaining_usd numeric,
  last_checked_at timestamptz
);

-- Started / finished numbers for Beep.
create table if not exists public.events (
  id bigserial primary key,
  user_id uuid,
  job_id uuid,
  name text not null,
  created_at timestamptz not null default now()
);

-- Removal requests from people shown in plans.
create table if not exists public.removal_requests (
  id bigserial primary key,
  contact text not null,
  created_at timestamptz not null default now()
);

-- Row level security: students only ever see their own rows.
alter table public.profiles enable row level security;
alter table public.jobs enable row level security;
alter table public.reports enable row level security;
alter table public.company_cache enable row level security;
alter table public.apify_tokens enable row level security;
alter table public.events enable row level security;
alter table public.removal_requests enable row level security;

create policy "own profile" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "own jobs read" on public.jobs for select using (auth.uid() = user_id);
create policy "own jobs update" on public.jobs for update using (auth.uid() = user_id);
create policy "own reports" on public.reports for select using (
  exists (select 1 from public.jobs j where j.id = job_id and j.user_id = auth.uid())
);
-- company_cache, apify_tokens, events, removal_requests: no policies = server (service role) only.

-- Create a profile on sign-up.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'), new.email)
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Private bucket for resume PDFs.
insert into storage.buckets (id, name, public) values ('resumes', 'resumes', false)
  on conflict (id) do nothing;
