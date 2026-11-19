# Gotchas

What broke in Hunting Fox, why it broke, and what we changed. Read this before touching the same area, so the same thing doesn't break twice. Each entry ends with **the rule to keep**.

Commit hashes point to the fix on `main`.

---

## AI calls (`src/lib/ai.ts`)

### 1. Every long AI reply was killed at 60 seconds
- **What broke:** resume rewrites failed or took 5–6 minutes; emails came back as the template or "No answer from the AI".
- **Why:** the OpenAI client had a flat `timeout: 60_000`. A full resume rewrite on Sonnet takes 1–2 minutes, so it was always cut off. The cut-off was then treated as a network error and retried 3 times, and `makeResume` repeated the whole thing once more: up to 6 calls of ~60 s, all failing the same way.
- **Changed:** replies are **streamed** (`stream: true`), so length never hits a request timeout. We only give up if nothing starts within 60 s, or the reply passes `60 s + 40 ms × max_tokens` (max 280 s). A timed-out, cut-off (`finish_reason: length`) or non-JSON reply is **not** retried on the same provider. `makeResume` makes one call. (`a5c7045`, `f334707`, `eb44f66`)
- **Rule:** never put a flat timeout on AI calls; never retry a reply that failed because of its own size or shape.

### 1b. "Reply cut off at 1800 tokens" on a short email
- **What broke:** Jitesh's email failed after 15 s: "Reply cut off at 1800 tokens".
- **Why:** every task had its own small output limit (1,800 for messages, 8,000 for the resume). The reply also carries hidden working notes (`brief`), and newer models can spend part of the limit thinking.
- **First fix (wrong):** bigger limits plus a retry with 3× the room. Rajveer pointed out that retrying spends money twice, and a cap only breaks replies.
- **Now:** **no per-task caps.** Every call may write up to the model's own limit (32,000, or lower if the model's 400 says so). You only pay for what it writes. No total-time cap: we only give up if nothing starts within 60 s. No retry on a cut-off. Length is controlled by the prompts. (`b84f968`)
- **Rule:** control length in the prompt, never by cutting the reply or capping tokens.

### 1c. The LinkedIn note was chopped in code
- **What broke:** a note over 200 characters was cut in code (`note.slice(0, 199)`), which could end mid-thought.
- **Now:** the 200-character limit is a **strict rule in the prompt** (critical rule 0, counted in the self-check). Code never cuts it; an over-long note is only logged.
- **Rule:** limits on what the AI writes belong in the prompt, as strict rules.

### 2. Sonnet 5.5 refused every request: "`temperature` is deprecated for this model"
- **What broke:** every resume rewrite and every email failed within 1 second.
- **Why:** we sent `temperature` on every call; newer models reject it with a 400.
- **Changed:** `temperature` and JSON mode are optional extras. On a 400, `chat()` drops the setting the error names, asks again, and remembers it for that model. (`79f777a`)
- **Rule:** treat every non-required request setting as optional; models drop support without warning.

### 3. "I picked Sonnet, but DeepSeek wrote the email"
- **What broke:** a free DeepSeek model wrote messages even though Sonnet was chosen in Admin.
- **Why (two bugs):**
  1. The Admin "Writing" dropdown showed the first AI when nothing was saved (`value={val || data.ai[0]?.id}`), so it *looked* chosen. Picking the option already showing saves nothing.
  2. When the picked provider failed (see #2), the code silently fell back to every other provider.
- **Changed:** the dropdown shows "Not picked: try each AI in order" when unset. When a provider is picked, **only that one** is used (plus a student's own key first). Errors list every attempt in order. (`ac62522`)
- **Rule:** a settings control must show the saved value, never a default that looks saved. No silent fallback to a different model.

### 4. The error the student saw named the wrong AI
- **Why:** only the last attempt's error was kept.
- **Changed:** the error reads "Tried your own key: … · then Anthropic (claude-sonnet-5-5), 12s: …". (`ac62522`)

---

## Messages (reach-out page, `/api/jobs/[id]/more`, `prompts/write-messages.md`)

### 5. Students got a fill-in-the-blanks template instead of a real email
- **What broke:** "I'm writing to you because you work at Treelife as Co Founder…", even when the student had typed notes.
- **Why:** when the AI failed (#1, #2), `writePerson` quietly returned the `buildMessages` template from `rules.ts`.
- **Changed:** the template is **deleted** (`buildMessages`, `writeMany`). `writePerson` returns a real AI message or throws; the page shows a red box with the reason and keeps the student's words. Old saved template messages are detected (`isOldTemplate`) and shown as not written. (`b26d749`, `8c2a3dc`)
- **Rule:** never fake an AI result. A clear error beats a convincing-looking bad output.

### 6. A failed write was shown as a success
- **Why:** the page checked `if (d.people)`, and the error response also carried `people`.
- **Changed:** check `r.ok` first. (`b26d749`)
- **Rule:** check the HTTP status, not just the shape of the body.

### 7. Switching to another person stopped the first message
- **Why:** the page held a single `writing` id, and the request lived in the browser. Starting B cleared A's spinner; leaving the page could cut the request.
- **Changed:** `POST /more` marks the person `writing: {at}`, answers 202, and writes in `after()` on the server. Each person has their own state; the page polls `GET /more`. Saves go through `savePerson` (read, replace one person, read back, redo if another save won), so several can finish at once. (`54a9131`)
- **Rule:** anything that takes more than a few seconds runs on the server and saves its own state.

### 8. "(rajveerbiradar012)" in the email sign-off
- **Why:** the name came from the Google account's full name.
- **Changed:** use the resume name; strip anything in brackets. (`b26d749`)

### 9. Student's notes replaced our email instead of being mixed in
- **Changed:** notes are optional and **blended**: they lead the message, and the AI still adds the person's hook and real resume proof. One **Write my email** button; no minimum length. (`1aeb9bb`, `f334707`)

### 10. Emails opened with a past employer and called the student a founder
- **What broke:** "Most recently: GTM Engineering Intern, Otto…"; "Founder and solo builder" for a Founder's Office role (reads as "will leave to run their own thing").
- **Changed:** both prompts work out what the company believes and what the student would deliver there, and Step 3b thinks like the person deciding whether to hire. Past employers and the student's own product are proof, never identity. (`9ad0497`, `dfd0ab1`)
- **Rule:** prompts write to get the student hired, not to list everything relevant.

### 11. LinkedIn note had a link; emails said "happy to send my resume"
- **Changed:** the note never has a link; every email says "I've attached my resume." and code rewrites any "happy to send" line. (`670568f`, `b19169d`)

---

## Resume (`/jobs/[id]/resume`, `src/lib/pipeline/resume.ts`, `src/lib/resumeDiff.ts`)

### 12. AI failure shown as "No changes suggested"
- **Why:** a failed or empty AI reply produced an empty result, which looked like "your resume already fits".
- **Changed:** `makeResume` saves `failed` with the reason; the page shows a red card with **Try again**. An old empty v2 result is treated the same. (`32d35f8`)
- **Rule:** an empty result must never be shown as a good result.

### 13. AI edits were thrown away
- **Why:** an edit is matched to a resume line by its `old` text, exactly. The AI often drops a `- `, a `**` or a space.
- **Changed:** match on plain words (markers, bold and spacing ignored), then use the real line. (`32d35f8`)

### 14. Retry and "Rewrite with my answers" were lost when you left the page
- **Changed:** the POST saves `resume.rewriting = {at, kind}` and answers 202; `after()` does the work and saves the result. The page shows "Rewriting…" and a loader over the resume, also after coming back, and polls `GET /resume-plan`. (`8d61075`)

### 15. Answers vanished after a refresh
- **Why (three causes):**
  1. Typed answers lived only in page state.
  2. A rewrite asks *new* questions with different wording, and earlier answers were only shown next to their original question.
  3. If `007_facts.sql` wasn't run, saving to `profiles.facts` failed silently.
- **Changed:** typed answers are saved on the server as you type (`resume.drafts`); submitted answers are kept on the job (`resume.answered`) and always listed; a failed `facts` save is written to the job log. (`eb44f66`, `798f343`)
- **Rule:** never let user input live only in browser state. Never ignore a database error.

### 16. The PDF had Chrome's date, title, URL and page numbers on it
- **Changed (twice):**
  1. Server PDF with `@react-pdf/renderer` `renderToBuffer`: **worked locally, failed on Vercel** ("site wasn't available").
  2. Now the PDF is made **in the browser** (`PdfButton` → `src/lib/resumePdf.tsx`), like OpenResume, with fonts from `public/fonts/`. (`9d68813`, `22d9fa9`)
- **Rule:** don't move PDF generation back to the server.

### 17. Name overlapped the headline in the PDF
- **Changed:** explicit `lineHeight` on the name. (`22d9fa9`)

### 18. Founder's Office jobs always got "no changes"
- **Why:** the old prompt only added missing keywords; a Founder's Office post has few tool words.
- **Changed:** recruiter-style rewrite: priorities in the job's language, real rewrites of the headline, summary and bullets, gap questions, and change by default. (`35d7fac`)

### 19. Comparison layout problems
- Side-by-side was lost in a rebuild (`32d35f8`).
- The "Why" box made rows tall (`03349d9`).
- Rows were padded to match heights, leaving white space on the left (`6fcb4e5`).
- Copy/Drop buttons were inside the resume, and the ? was big (`8b3a3d2`).
- **Now:** two columns flow independently. Each changed line has a small **?** (reason on hover/tap) and **✕** (drop; ↺ to undo) in a gutter outside the resume. Phones get one stacked list.

### 20. "Keep" looked dead, then a "Kept" pop-up appeared
- **Why:** every change starts kept, so Keep changed nothing; then a toast said "Already kept".
- **Changed:** one ✕ to drop, ↺ to undo, no pop-ups. (`b7317c3`, `8b3a3d2`)
- **Rule:** don't ask the user to confirm a state that's already the default.

### 21. Resume upload made the student wait on the page
- **Changed:** the upload answers at once (202); the AI read runs in `after()` and saves straight away; the page polls and the student can leave. (`65e005f`)

---

## Finding people (`src/lib/pipeline/fetchers.ts`, `run.ts`)

### 22. A fake company (ThinkNova) went through as real
- **Why:** a website listed on the LinkedIn page was treated as proof.
- **Changed:** a listed website is only "unknown". 0 people + no poster + page says 51+ employees → stop as `fake` (`no_people`), which doesn't use a search. (`a0c87c7`)

### 23. Small startups with one person got stuck
- **Changed:** 0–1 person at a small company is a warning (`unverified`), and the search carries on. (`199b4da`)

### 24. Only one person was shown
- **Changed:** top up with anyone at the company; later replaced by the company's own LinkedIn employee list. (`36a7c46`, `77b6235`)

### 25. A person who doesn't work there was shown (Rahul @ credfine for Sure)
- **Why:** the website-based people search returned people by email domain match, without checking their current job.
- **Changed:** people come from the **company's own LinkedIn employee list**. The website search is only for jobs with no LinkedIn company page, and every person is cross-checked (`worksThere`). Off-domain emails are dropped. (`a54cef8`, `77b6235`)

### 26. People were filtered out by job title
- **Changed:** nobody is filtered out by role; everyone is ranked by closeness to the job (Founder's Office → founders/CEO first). A work email and a real connection are only tie-breakers. (`77b6235`, `61db013`)

### 27. The job poster was flagged "doesn't list this company" by mistake
- **Changed:** the job poster is always first; that check was removed. (`f985c68`)

---

## App and pages

### 28. New account had no way to reach "My jobs"
- **Why:** the header link showed only after a job was marked applied.
- **Changed:** "My jobs" is always in the header; an empty My jobs page; the paste box sits on My jobs and on stopped/fake job pages. (`faafadb`)

### 29. A new search didn't appear in the list until refresh
- **Why:** `useLiveJobs` kept its first list (`useState(initial)`) and only updated rows it already had.
- **Changed:** `announceJob()` fires `hf:jobs` when a search starts; the hook pulls `/api/jobs` and adds new rows; a server refresh replaces the list. (`ddf3a1f`)
- **Rule:** `useState(prop)` ignores later prop changes; sync it on purpose.

### 30. The back button scrolled away
- **Changed:** "‹ Back to {company}" lives in the sticky top bar. (`f109a56`)

### 31. Server ran in Washington, far from Supabase in Mumbai
- **Changed:** `regions: ["bom1"]` in `vercel.json`. (`341aa62`)

### 32. React Server Components security issue (CVE)
- **Changed:** Next.js/React updated; merged from Vercel's PR #1. (`c7833b1`)

### 33. Resume upload failed silently when no AI provider was set
- **Changed:** clear errors (`no_ai`, AI failed). (`acd6375`)

---

## Setup gotchas (not code bugs, but they break things)

- **Run every migration.** If `007_facts.sql` is missing, answers don't carry across jobs (the job log says so).
- **Pick the writing AI in Admin → API keys** and watch for "Saved". "Not picked" means every AI is tried in order.
- **A student's own AI key always goes first**, before Admin's choice. Remove it from Account → Use your own keys to test Admin's model.
- **Fluid Compute must be on in Vercel** (Settings → Functions). Without it, Hobby stops every function at 60 s, whatever `maxDuration` says.
- **`KEYS_SECRET` must never change** once keys are saved, or every saved key becomes unreadable.


---

## Where Claude was wrong: assumptions vs what Rajveer said

Every reply from Claude ended with "Assumptions I made". These are the ones that turned out wrong, what Rajveer said, and what was done. Use this list to avoid repeating them.

| # | Claude assumed | Rajveer's response | What we did |
|---|---|---|---|
| 1 | A website listed on the LinkedIn page is proof a company is real | ThinkNova is fake and still went through | A website is only "unknown"; no people + no poster + 51+ employees stops as fake |
| 2 | People should be filtered by job title | "Rank, don't filter. For a Founder's Office a founder is more relevant than a PM" | No title filter; ranked by closeness to the job |
| 3 | A website-based people search is fine | "We need employees from LinkedIn only" (Rahul @ credfine didn't work there) | People come from the company's own LinkedIn list |
| 4 | Chrome's print dialog is good enough for the PDF | "Why is there this watermark?" | Our own PDF download |
| 5 | A server-made PDF works on Vercel because it worked locally | Download failed on the live site | PDF made in the browser (like OpenResume) |
| 6 | Messages could be written up front for everyone | Too slow; wanted to pick a person and write on request | Messages written one person at a time, on request |
| 7 | A fixed email shape and a backup template were acceptable | "Every email should be personalised; structure only as a loose reference" | Personal prompt; later the template was deleted completely |
| 8 | Student's notes OR our suggested email (either/or) | "Mix it with our intelligence; AI is bad at knowing what to say, the human adds insight" | Notes are blended, one Write my email button |
| 9 | A minimum length on the student's notes (60, then 10 characters) | "Why is there a limit on the minimum words?" | No minimum |
| 10 | Every change needs Keep and Drop buttons, plus a toast | "What is this Kept alert? Why are you asking Kept?" | Every change starts kept; one ✕ to drop, ↺ to undo, no pop-ups |
| 11 | The reason for a change belongs in a box under the line | "Put it in a ? circle, reveal on hover or click" | Small ? beside the line |
| 12 | Old and new lines should line up row by row | "Why leave white space on the left just to match heights?" | Both columns flow on their own |
| 13 | Copy and Drop buttons inside the resume were useful | "Remove Copy and Drop; just a ✕, outside the resume" | Small ? and ✕ in a gutter outside the resume |
| 14 | Answers only need hiding by exact question text | Answers vanished after refresh | Drafts saved as you type; answers kept on the job |
| 15 | Rewrites can run in the browser request | Leaving the page lost the retry | Rewrites and messages run on the server and save state |
| 16 | 60 s is enough time for an AI reply | Resume took 5–6 minutes, then failed | Streaming; no total time cap |
| 17 | Retrying a failed reply 3× on the same AI helps | Same: 5–6 minute waits | No retry for cut-off, timeout or unreadable replies |
| 18 | Falling back to other AI providers is helpful | "Why, when I chose Sonnet, was it using DeepSeek?" | Only the chosen AI is used; errors list every attempt |
| 19 | All models accept `temperature` | Every request failed: "temperature is deprecated for this model" | Rejected settings are dropped and the request resent |
| 20 | Small per-task token limits (1,800 / 8,000) save money | Email cut off at 1,800 tokens | Raised, with a retry (see 21) |
| 21 | A retry with 3× the room is a safe fix for cut-offs | "No cap on things. I am spending money on it, this is not a play thing" | No caps, no cut-off retry; length set by prompts |
| 22 | Cutting the LinkedIn note in code to 200 is fine | "It should be a strict rule in the prompt, not a check that cuts the response" | Strict prompt rule; code never cuts |
| 23 | Listing everything relevant makes a good resume ("Founder and solo builder") | "Will a Founder's Office hire me if I say I'm a founder?" | Step 3b: write to get hired; own product is proof, not identity |
| 24 | Leading with the past employer (Otto) is fine | "Write the company we're applying to, what they believe, what we'd deliver" | Company belief + what the student would deliver lead |
| 25 | The prompts' structure was enough | "I need Morning Espresso level of detail" | Prompts rewritten with must-include steps, self-check, examples, test input |
| 26 | "My jobs" in the header only after the first applied job | New account had no way to reach jobs | Always in the header, plus an empty state |
| 27 | A "New search" button is enough on My jobs | "Why a button and not the search bar itself?" | Paste box on My jobs and stopped job pages |
| 28 | The page's back link is enough | "When I scroll down I don't see the back button" | Back button in the sticky top bar |
| 29 | The list updates when the popup closes | New search not shown until refresh | Lists update live |
| 30 | The effort report as Markdown | It was meant to be HTML | HTML report |
| 31 | Pushing after every change without asking | "Build it but ask me before pushing" (for that batch) | Asked before that push |

Assumptions that held (not wrong, kept): admin approval before searching; students send messages themselves; Mumbai region; one gradient button per screen; light mode only.
