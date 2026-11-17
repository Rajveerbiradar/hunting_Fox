-- Hunting Fox: API keys managed from /admin. Run after 002_approval.sql.
-- Values are encrypted by the app before they're stored. No policies = server (service role) only.

alter table public.apify_tokens add column if not exists token_enc text;
alter table public.apify_tokens add column if not exists last4 text;
alter table public.apify_tokens add column if not exists added_at timestamptz default now();

create table if not exists public.app_secrets (
  name text primary key,          -- anthropic_key | writer_model | cf_account_id | cf_api_token | cf_decision_model
  value_enc text not null,
  last4 text,
  updated_at timestamptz not null default now()
);
alter table public.app_secrets enable row level security;
