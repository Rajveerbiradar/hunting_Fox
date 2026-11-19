-- 008: AI usage and per-student AI budgets. Safe to run again.

-- Every AI call: which provider/model, tokens in and out, for whom. Admin → API keys shows totals per model.
create table if not exists public.ai_usage (
  id bigserial primary key,
  at timestamptz not null default now(),
  provider_id text,              -- ai_providers.id, 'env', 'own' (student's own key) or 'clef'
  provider_name text,
  model text,
  task text,                     -- prompt name (resume-changes, write-messages, build-prompt, rank…)
  tokens_in integer not null default 0,
  tokens_out integer not null default 0,
  estimated boolean not null default false,  -- true when the provider didn't report usage (counted from text length)
  user_id uuid,
  job_id uuid
);
create index if not exists ai_usage_at on public.ai_usage (at desc);
create index if not exists ai_usage_provider on public.ai_usage (provider_id, at desc);
create index if not exists ai_usage_user on public.ai_usage (user_id);
alter table public.ai_usage enable row level security;  -- server only (service key), no policies

-- Price per million tokens, entered by admin when adding a model, to show what each model has cost.
alter table public.ai_providers add column if not exists price_in numeric not null default 0;
alter table public.ai_providers add column if not exists price_out numeric not null default 0;

-- Each student's AI budget in tokens (in + out). Never shown as a number to students, only as a % left.
alter table public.profiles add column if not exists ai_tokens_used bigint not null default 0;
alter table public.profiles add column if not exists ai_token_limit bigint not null default 250000;

-- Clef price (per million tokens in / out) lives in app_secrets settings: clef_price_in, clef_price_out.
