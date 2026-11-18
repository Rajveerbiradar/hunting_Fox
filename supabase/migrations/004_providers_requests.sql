-- Hunting Fox: AI providers, students' own keys, "Ask for more searches", live steps.
-- Run after 003_keys.sql.

-- Apify: credit on the account when it was added, so the admin sees "left of total".
alter table public.apify_tokens add column if not exists start_usd numeric;

-- Jobs: which key paid for it. Searches on the student's own Apify key don't count.
alter table public.jobs add column if not exists own_key boolean not null default false;

-- AI providers in the OpenAI SDK format (base URL + key + model). Used in `position` order;
-- if one fails, the next working one takes over. Server only.
create table if not exists public.ai_providers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  base_url text not null,
  key_enc text not null,
  last4 text,
  model text not null,
  position int not null default 0,
  ok boolean not null default true,
  last_error text,
  checked_at timestamptz,
  added_at timestamptz not null default now()
);
alter table public.ai_providers enable row level security;

-- A student's own keys. Encrypted by the app, only used for that student's searches. Server only.
create table if not exists public.user_keys (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('apify','ai')),
  key_enc text not null,
  last4 text,
  base_url text,
  model text,
  provider text,
  remaining_usd numeric,
  start_usd numeric,
  fallback text not null default 'free' check (fallback in ('free','stop')),
  ok boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind)
);
alter table public.user_keys enable row level security;

-- "Ask for more searches" and Rajveer's answers. Server only (read through the API).
create table if not exists public.search_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  note text,
  status text not null default 'waiting' check (status in ('waiting','approved','declined')),
  granted int,
  waitlist boolean not null default false,
  message text,
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  seen_at timestamptz
);
create index if not exists search_requests_user_idx on public.search_requests(user_id, created_at desc);
alter table public.search_requests enable row level security;

-- Sign-ups that were told "not yet" (kept on the waiting list) and the message they got.
alter table public.profiles add column if not exists declined_at timestamptz;
alter table public.profiles add column if not exists decline_message text;
