-- Hunting Fox: admin approval and per-student search allowance.
-- Run after 001_init.sql. Safe to run more than once.

alter table public.profiles add column if not exists approved boolean not null default false;
alter table public.profiles add column if not exists search_limit int not null default 0;
alter table public.profiles add column if not exists approved_at timestamptz;
alter table public.profiles add column if not exists note text; -- admin's private note, e.g. "Pune college WhatsApp group"

-- Students can read their own row but must never approve themselves or raise their own allowance.
-- Only these columns stay editable from the browser; everything else is server (service role) only.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (name, skills, links, education, email_ready, email_reminders) on public.profiles to authenticated;

-- Same for jobs: students may only change their own tracker fields, never status or results.
revoke insert, update, delete on public.jobs from anon, authenticated;
grant update (apply_status, applied_at, opened_posting_at, sent_to) on public.jobs to authenticated;
