# Hunting Fox — notes for Claude Code

Read this first. It's the whole project in one place.

## What it is

Hunting Fox helps Indian college students get noticed for a job. A student pastes a LinkedIn or Naukri job link and gets:

1. A check that the company is real (not fake / closed / agency).
2. What to change in their resume for that job (only skills they confirmed they have).
3. People who work there (public LinkedIn data), ranked by who's most likely to reply.
4. A LinkedIn note and an email for each person. **The student sends them themselves. We never send anything.**

It's Rajveer's free personal project, built for Beep's Founder's Office task (deadline Fri 20 Nov 2026). Students need admin approval and get a set number of "searches".

- Live: https://hunterfox.journeytix.com (also https://huntingfox.vercel.app)
- Repo: github.com/Rajveerbiradar/hunting_Fox (branch `main`, Vercel auto-deploys on push)
- Owner/admin: Rajveer · rajveerbiradar360@gmail.com · WhatsApp +91 80974 74757

## Stack

- Next.js 15 (App Router, TypeScript), React 19, deployed on Vercel (Hobby).
- Supabase: Postgres + Auth (Google only) + Storage bucket `resumes`. Project ref `bordbhjvnstmvjcicrhy`.
- Apify actors for scraping (job page, company, employees). Many Apify tokens rotate.
- AI through the **OpenAI SDK** (`openai` package) against any OpenAI-compatible provider (Anthropic `https://api.anthropic.com/v1/` with `claude-haiku-5-5`, OpenAI, Groq, OpenRouter, Cloudflare). No Anthropic SDK.
- Optional Resend for email.

## Run it locally

```bash
npm install
cp .env.local.template .env.local   # then fill the values
npm run dev                          # http://localhost:3000
npx tsc --noEmit && npm run lint && npm run build   # before every commit
```

For Google sign-in to work locally, Supabase → Authentication → URL Configuration → Redirect URLs must include `http://localhost:3000/auth/callback`.

`.env*` is gitignored except `.env.example` and `.env.local.template`. Never commit real keys.

## Environment variables

| Name | Vercel type | What |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Config | `https://bordbhjvnstmvjcicrhy.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Config | Supabase **Publishable** key (`sb_publishable_…`) |
| `NEXT_PUBLIC_SITE_URL` | Config | `https://hunterfox.journeytix.com` (no trailing slash) |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret | Supabase **Secret** key (`sb_secret_…`). Server only. |
| `ADMIN_EMAILS` | Secret | comma-separated admin Gmails |
| `KEYS_SECRET` | Secret | AES key material for keys saved in /admin. **Never change** once keys are saved. |
| `CRON_SECRET` | Secret | protects `/api/cron` |
| `AI_API_KEY` / `AI_BASE_URL` / `AI_MODEL` | optional | fallback AI provider if none added in /admin |
| `APIFY_TOKENS` | optional | `label:token,label:token` fallback if none added in /admin |
| `SCAN_MODE` | optional | `full` / `lean`; also settable in /admin |
| `RESEND_API_KEY`, `EMAIL_FROM`, `NEXT_PUBLIC_EMAILS=on` | optional | emails |

`NEXT_PUBLIC_*` must stay public (browser sign-in needs them); in Vercel they must be type **Config**, not Secret.

**API keys normally live in the database, not env**: /admin → API keys (Apify accounts and AI providers). Every key must pass a test before it can be saved. Stored AES-256-GCM encrypted with `KEYS_SECRET` (`src/lib/secrets.ts`).

## Database

Run these in Supabase → SQL Editor, in order (all are idempotent):

1. `supabase/migrations/001_init.sql` — profiles, jobs, reports, company_cache, apify_tokens, events, removal_requests, RLS, signup trigger, `resumes` bucket
2. `002_approval.sql` — approval + per-student search limit
3. `003_keys.sql` — encrypted Apify tokens, `app_secrets` (settings + AI routing)
4. `004_providers_requests.sql` — `ai_providers`, `user_keys` (students' own keys), `search_requests`, jobs.own_key
5. `005_admin.sql` — removal done/blocked people
6. `006_job_logs.sql` — `job_logs` (per-job step log)

Server-only tables have RLS on and no policies; the app reads them with the service key (`adminClient()`). Students can only update whitelisted profile columns (see 002).

## How a search runs (server side)

`POST /api/jobs` (src/app/api/jobs/route.ts) checks approval + limit + "paused", inserts a `jobs` row, then `after(() => runJob(id))` so it runs in the background in its own invocation. The browser only polls.

`runJob` → `scan` in `src/lib/pipeline/run.ts`:

0. Read job (LinkedIn/Naukri actor) — `fetchers.ts`
1. Check company — `rules.ts` `checkCompany` (fake / closed / agency stop here; they don't count as a search)
2. Find people — `fetchPeople` (b2bsearch by domain, harvestapi fallback), cached per company for 7 days, minus `blocked_people`
3. Resume changes ∥ rank people — two AI calls in parallel (`prompts/resume-changes.md`, `prompts/rank-people.md`); each falls back silently
4. Write messages — templates in `rules.ts`, AI personal line only when there's a real connection (`prompts/personal-line.md`), top 2 people only
5. Done → `reports` row, `events` "finished"

`jobs.step` (0–5) + `step_detail` drive the progress popup, the live "three dots" step on Home/My jobs and admin Jobs.

Student's own keys (`src/lib/ownKeys.ts`): if they have an Apify key, the search runs on it only and `jobs.own_key = true` (doesn't count). If it runs out: fall back to free searches or stop (`user_keys.fallback`).

Apify rotation (`src/lib/apify.ts` `runActor`): DB tokens in `added_at` order, then env. Rotates on 401/402/403/credit text and on 429/5xx/network; parks exhausted accounts; **never** retries a timeout on another account (it may still be running and costing money). Pooled credit = sum of all accounts; below $5 → "lean" mode.

Ranking people with **Clef** (`src/lib/clef.ts`): Cloudflare's decision model (`@cf/cloudflare/clef-flash` or `clef`, REST `/ai/run`, System One API: `state` + typed `questions` → probabilities, wrapped in `result`). It's not a chat model, so it's not in the AI providers list. Set up in /admin → API keys → Clef (Account ID + Workers AI token + model, tested before save; stored as settings `clef_account_id`, `clef_token`, `clef_model`). When `ranker_provider` = `clef`, `rankTask` asks Clef one `score` question (usefulness) and one `choice` question (real connection) per person, re-checks every connection in code (exact school / company / skill / "hiring" in headline), and builds the one-line "why" from templates. Any Clef failure falls back to the chat ranker (`decide`).

AI (`src/lib/ai.ts`): one call per task, JSON mode with fallback, providers in order with the routed one first (`writer_provider` / `ranker_provider` settings); a failing provider is marked and the next takes over.

## Debugging — start here

- **/admin → Jobs → Log** on any job: every step, every Apify account tried (status, ms), every AI call, and the error + stack. Same lines in Vercel → Logs, prefixed `[job xxxxxxxx]`. Logging is `jlog()` in `src/lib/joblog.ts` (AsyncLocalStorage carries the job id).
- `jobs.error` holds the short reason; the admin Jobs list shows it in red.
- Common causes:
  - `No Apify tokens` → add an Apify account in /admin → API keys.
  - `No AI provider` → add a provider in /admin → API keys. (Resume upload also needs this: it returns `no_ai`.)
  - Sign-in loops / lands signed out → Supabase redirect URLs, or Google OAuth client redirect URI `https://bordbhjvnstmvjcicrhy.supabase.co/auth/v1/callback`.
  - `/admin` says "This account isn't an admin" → email not in `ADMIN_EMAILS` / Settings, or not redeployed.
- "Run again" in admin Jobs retries without using the student's search.

## Routes

Student: `/` (Home: paste box, resume, news, ask-for-more), `/sign-in`, `/jobs` (My jobs), `/jobs/[id]` (job page), `/jobs/[id]/resume`, `/jobs/[id]/reach-out`, `/account` (resume, skills, links, education, **Use your own keys**), `/remove-info`, `/terms`, `/privacy`, `/r/[token]` (shared resume).

Admin: `/admin` single page with a menu (`#students`, `#requests`, `#jobs`, `#keys`, `#usage`, `#removals`, `#settings`). Server guard `requireAdmin()` on every admin API.

APIs: `src/app/api/**` — jobs, resume, profile, account, account/keys, requests, remove-info, cron (daily: retry stuck, flip no-reply, 30-day delete, refresh credit), admin, admin/{keys,requests,jobs,usage,removals,settings}.

## Design rules (v2) — keep to these

Design source: the "Hunting Fox v2" canvas artifact. Tokens are in `src/app/globals.css` `:root`.

- Light mode only. Font Reddit Sans, weights 400/600/700 only. Squircles (`corner-shape: squircle`) everywhere. iOS line spinner (`Spinner`).
- Brand: **dark-to-light blue gradient** `linear-gradient(135deg,#0a2a6b,#2a74e6)`, white text, white fox (`/fox-white.png`). Only on **one main button per screen** (the student's real next step) and the logo tile. **No yellow, no orange, no pink.** Never a background.
- Sub text is **grey** `#5b6472` (`var(--mute)`). Ink `#101828`. Page `#f2f4f7`, cards white, sunken `#f7f8fa`, fill `#e7eaee`, tile `#eef1f5`.
- Selected state = ink fill + white + ✓. Company/person tiles are neutral; the only colour in a row is its status tag.
- Status: success `#1a6b3c/#e5f3e9`, danger `#b8132f/#fdecef`, info `#164a88/#e7effa`, waiting/neutral `#5b6472/#eef1f5`, warning (real warnings only) `#4f3e00/#ffefb0` with ⚠.
- Type: display clamp(36,6vw,48) · h1 clamp(30,4vw,36) · h2 24 · title 18 · body 16 · caption 14 · tag 13 · label 12 caps.
- Buttons: 36 / 44 / 52 tall; 44 minimum on touch.
- Every loading action shows a spinner immediately. `PressFeedback` (mounted in the root layout) does this for **every** button automatically: any `fetch` started within 400 ms of a click puts `data-busy` on that button (spinner, no double taps) until it answers; buttons with their own state set `aria-busy` to opt out (`LinkBox`, sign-in). Link clicks show a thin top bar; every route has a `loading.tsx` skeleton (`PageLoading`).
- Retries: Apify, AI providers and Clef retry the **same** key up to 3 tries (1–4 s waits) on network/408/429/5xx before moving on; never on bad keys, no credit, or an Apify timeout.
- Vercel functions run in Mumbai (`regions: ["bom1"]` in vercel.json), next to Supabase.
- Lists have the Newest/Oldest toggle (`useSort` in `src/components/ui.tsx`).

## Copy rules

Plain, descriptive words a student would use. No jargon ("plan", "pipeline", "credits" in student copy → "searches"). Say what happens, not what the system is. Messages to students come from Rajveer, first person, and end with his WhatsApp + email (`src/lib/messages.ts`, `src/lib/contact.ts`).

## Before you commit

1. `npx tsc --noEmit` · `npm run lint` · `npm run build` all pass.
2. New table/column → new numbered migration in `supabase/migrations/` and a line in this file + README.
3. Commit to `main` and push; Vercel deploys. Tell Rajveer if a migration needs running.

## Open items

- Spacing pass from the design audit (four spacing roles 12/16/32/48, panel indents) not done.
- Phone bottom action bar on job page / resume / reach-out not done.
- Google branding verification: verify `journeytix.com` in Search Console (TXT in Cloudflare), maybe rename app "Hunting Fox by JourneyTix". Sign-in works without it.
- Contact (WhatsApp/email) is hard-coded in `src/lib/contact.ts`, shown read-only in Settings.
- AI cost isn't tracked in Usage.
