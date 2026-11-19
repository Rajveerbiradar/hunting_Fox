# Hunting Fox

Paste a LinkedIn or Naukri job. Hunting Fox checks the company is real, finds people who work there, shows what to change in your resume, and writes messages you send yourself.

## How a scan works

Each pasted link becomes one row in `jobs` and runs on its own (`after()` in `POST /api/jobs`), so one slow or failed job never blocks another. The progress popup polls that row.

| Step | Who does it | Cost |
|---|---|---|
| 1. Read the job | Apify (`automation_craft/linkedin-job-details-scraper` or `blackfalcondata/naukri-jobs-feed`) | ~$0.001 |
| 2. Check the company | Plain code rules (`src/lib/pipeline/rules.ts`) | free |
| 3. Find people | Apify `b2bsearch/company-employees`, fallback `harvestapi/linkedin-company-employees`. Cached per company for 7 days. Code keeps only each person's current job. | ~$0.045 full / less in lean |
| 4a. Resume changes | Writer model, one call (`prompts/resume-changes.md`). Edits that don't match a real resume line are dropped. | 1 call |
| 4b. Rank people | Decision model, one call, in parallel with 4a (`prompts/rank-people.md`) | 1 call |
| 5. Messages | Fixed template filled by code. The writer adds one line only when ranking found a real connection (`prompts/personal-line.md`). Only the top 2 people are written; the rest when the student taps "Show more". | 0–2 calls |

The resume is read once at upload (`prompts/resume-profile.md`) and reused for every job.

## Setup

1. **Supabase**: create a project, run `supabase/migrations/001_init.sql`, then `002_approval.sql`, `003_keys.sql`, `004_providers_requests.sql`, `005_admin.sql`, `006_job_logs.sql`, `007_facts.sql` and `008_ai_usage.sql`, in that order, in the SQL editor. Turn on Google under Authentication → Providers, and add `https://YOUR-SITE/auth/callback` to the redirect URLs.
2. **Vercel**: import this repo, add every variable from `.env.example`, deploy.
3. Set `NEXT_PUBLIC_SITE_URL` to the deployed address and redeploy.
4. Test with 3 LinkedIn links and 1 Naukri link before sharing.

## Approving students

Nobody can search until you approve them. Put your Google email in `ADMIN_EMAILS`, sign in, and open `/admin`:

- **Waiting** lists everyone who signed up. Set how many searches they get (default 25) and tap **Approve**.
- **Remove access** stops new searches but keeps their saved jobs.
- Failed, closed and fake jobs never count toward a student's searches.

## API keys

Paste, replace or remove keys in `/admin` → **API keys**:

- **Apify accounts**: credit is read from Apify when you add one, and the total adds up every account. When one runs out, the next takes over.
- **AI providers** in the OpenAI SDK format (base URL + key + model): Anthropic, OpenAI, OpenRouter, Groq, Cloudflare Workers AI. Pick which one writes and which one ranks people; if one fails, the next working one takes over.

Every key must pass a test before Save unlocks. Keys are stored encrypted with `KEYS_SECRET` and never shown again except their last 4 characters. Env variables still work as a fallback.

Students can add their **own** Apify and AI keys in Account → Use your own keys. Those are only used for their searches, and searches on their own Apify key don't count toward their limit.

**Ask for more searches**: students who run out can ask from the home screen. Answer in `/admin` → Search requests (+10, +25, a custom number, or Say no with an editable message and the waiting list). They see the answer in the app and by email, with your WhatsApp and email.

## Apify accounts

Any number of accounts (from `/admin` and/or `APIFY_TOKENS`). Each Apify call tries them in order and moves to the next one when a token is out of credit, over its limit, revoked (401/402/403), busy (429) or down (5xx). Out-of-credit and revoked tokens are parked in the `apify_tokens` table and skipped; the credit check un-parks them when they have credit again. A timeout is never retried on another account, so one slow run is never paid for twice.

## Beep numbers

Also shown at the top of `/admin`.

```sql
select name, count(*) from events group by name;            -- started / finished / applied_marked / failed
select count(distinct user_id) from events where name = 'started';
```


## Admin (`/admin`)

One page with a menu: **Students** (approve, set searches, "not yet" message, bulk approve), **Search requests**, **Jobs** (every pasted link, live step, run failed ones again), **API keys**, **Usage** (Beep numbers, funnel, searches per day, Apify cost), **Removal requests** (mark as removed deletes the person from every saved list and blocks them from future scans) and **Settings** (searches for new students, auto-approve, ask-for-more on/off, admins, emails on/off, delete data after 30 days, pause new searches, delete all test data). Admins are `ADMIN_EMAILS` plus anyone added in Settings.
