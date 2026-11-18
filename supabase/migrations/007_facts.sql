-- Answers students give to the resume's gap questions ("Have you run anything outside code?").
-- Reused for every future job so they're never asked twice. [{ q, a, at }]
alter table public.profiles add column if not exists facts jsonb not null default '[]';
