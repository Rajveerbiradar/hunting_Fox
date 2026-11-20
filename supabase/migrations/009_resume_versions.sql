-- Every change to a student's main resume (profiles.resume_text), so the admin can see how it was built:
-- what the upload said, every setup edit (with the student's note), and every "make this my main resume".
create table if not exists public.resume_versions (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  source text not null,          -- upload | setup_fix | setup_add | setup_undo | make_main | undo_main
  lines text not null,           -- the whole main resume after this change
  note text,                     -- the student's own note (setup) or the uploaded file's name
  raw text,                      -- upload only: the text pulled from the file, before the AI read it
  file_path text,                -- upload only: the file in the resumes bucket
  job_id uuid references public.jobs(id) on delete set null
);
create index if not exists resume_versions_user on public.resume_versions(user_id, created_at desc);
alter table public.resume_versions enable row level security;
