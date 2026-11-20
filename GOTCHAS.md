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

### 10b. The email copied the student's voice-typed notes, misheard words and all
- **What broke:** the Treelife email opened "I watched your TED talk and read your articles… stayed with me", quoted "the importance of precautions" (a misheard "Constitution"), retold the founder his own company's origin story, and said "I know the role asks for more years".
- **Why:** the prompt told the AI the notes lead and every point must stay in, but never said the notes are rough, often voice-typed instructions to interpret. Nothing banned flattery openers, self-undermining lines or retelling the company's story.
- **Changed:** `write-messages.md` Step 5a: understand the notes first (fix misheard words when obvious, drop what's still unclear, treat "say hi…" as instructions, turn self-praise into resume proof). New critical rules 13 to 16: never point out a weakness, don't open by praising their content, don't retell the company's story, never copy notes word for word. Shorter body (90 to 140 words). This exact failure is now the BAD vs GOOD example.
- **Rule:** student input is raw material to understand, not text to paste.

### 10c. Every email came out the same shape (a template with nicer words)
- **What broke:** even the "good" emails read like a form: greeting, hook, company line, proof, ask, in the same order every time.
- **Why:** `write-messages.md` had a numbered "MUST contain, in whatever order" list, and one fixed prompt for every person. A fixed checklist produces a fixed shape.
- **Changed:** the numbered list is gone; the email tells the student's real story (how they found the company, what struck them, why their real work fits the job post), different every time. And every message and resume rewrite is now **two steps**: `prompts/build-prompt.md` first writes a fresh, detailed prompt for this exact task from all the data (company page, job post, person, team, resume, notes), then a second call follows it.
- **Rule:** never give the writer a fixed order of parts. Give it facts, the story and the rules.

### 10d. Students could spend unlimited AI money
- **What broke:** nothing stopped a student from pressing Try again / Write it again forever on Rajveer's keys.
- **Changed:** per-student AI budget (default 250,000 tokens, never shown as a number), counted from every call's real token usage; calls stop at the limit with a clear message; warnings at 10% left; admin top-ups. Usage and cost per model in Admin → API keys. (migration 008)
- **Rule:** every paid call must be counted against someone's budget before it's made.

### 10e. Emails and resumes were written in resume shorthand nobody can read
- **What broke:** the Garima email said "On Amchi Local, a Mumbai local-train trip-planning app, I took the idea into testing alone, ran a 40+ person tester program, held 25+ feedback conversations and closed 20+ reported issues", plus "AI-assisted workflows… sends them to Slack", "comfortable with PowerPoint and Google Sheets", "your team is very experienced", "I want to learn a lot". The tailored resume lines were just as dense.
- **Why:** the writer copied resume lines straight into the email; the prompts asked for "proof with numbers" and "the job's language" but never for simple language. Names of the student's own app and past company mean nothing to a stranger.
- **Changed:** a PLAIN ENGLISH section in `write-messages.md`, `resume-changes.md` and `build-prompt.md`: A2 to B1 level, short sentences, common words, no resume shorthand, no names of the student's own projects or small past companies in emails (say what they are), outcome not mechanism, one or two proofs each with why it matters, at most one "+", need first then proof, no skill claims without proof, no praise of the team, no "I want to learn". Resume bullets: one idea per line, at most one number, say what a project is the first time. The Garima email is now the BAD example, with a plain-English GOOD version.
- **Rule:** every sentence must be understood in one read by someone reading English as a second language.

### 10f. The LinkedIn note was forced even when there was nothing personal to say
- **What broke:** for people whose profile shows only a job title, the note came out generic.
- **Changed:** the note is written only when there's something real about the person (a connection, what they work on, their path, or the student's notes about them). Otherwise the AI returns an empty note with a reason (`note_skipped`), and the reach-out page says "No note for {name}. {reason}". **The email is always written and always personal.** If the person has no email, the note is always written (it's the only way to reach them).
- **Rule:** a note is optional; an email never is.

### 10g. The test run copied the prompt's own GOOD example into every email
- **What broke:** in the first local test of 10e/10f, both the Garima and the Jitesh emails reused the GOOD example's sentences word for word ("I have done this kind of work on my own… keep many small things moving until they are done"). A concrete example became a template again.
- **Changed:** rule 17 in `write-messages.md`: never reuse example sentences; two emails must not share a sentence beyond the greeting, "I've attached my resume." and the sign-off. `build-prompt.md` must not paste example lines into the prompt it writes. Rule 18: if the person posted the job, ask them to look at it, not to "pass it to whoever is reviewing".
- **Second try still copied:** the examples were written about Rajveer himself (Mumbai train app, about 40 testers), so the writer reused them as his real lines. Every example in `write-messages.md`, `resume-changes.md` and `build-prompt.md` now uses made-up students with different facts (Meera and Kirana Pay, a college fest, a bakery). Only the BAD example keeps the real failed email.
- **Rule:** examples show the level, never the words.

### 10h. Emails were "data into a fixed shape", not a story
- **What broke:** after the plain-English fix, emails still went: how I found the role → what Treelife does (told to Treelife's own people) → one stat ("I ran a 40-person tester group") → a plan paragraph → a wish paragraph → ask. One email said "closed every issue they reported" when the resume says 20+.
- **Why:** (1) my plain-English rule said "say what the company does in one clause", which contradicted the "don't retell their story" rule, and the example did it too; (2) the prompts still asked for "what the company believes + what you'd deliver + proof + ask", which is a shape; (3) the writer only got resume lines, which are data. There was no story in the input to tell.
- **Changed:** `write-messages.md` rewritten around ONE real moment (situation, problem, what the student did, what changed); never explain the reader's own company; no company, skills, plan or wish paragraphs; the self-check lists every fact against the inputs. The writer now gets `student.facts` (`profiles.facts`, the student's own answers, which hold real moments). When there's no moment to tell, the email stays short and returns `story_tip`, one question shown on the reach-out page ("Make it stronger: …"). The notes box now asks for "one real moment from your work".
- **Rule:** you can't write a story from data alone. Get a real moment from the student, or ask for one.

### 10i. Message writing removed completely
- **What broke:** after many rounds (templates, stat lines, fixed shapes, telling founders what their own company does, invented facts, sentences that don't follow from each other, a TED talk "point" that wasn't what the student said), Rajveer judged the AI emails and LinkedIn notes not good enough to put in front of students.
- **Changed:** removed all message writing. The people page now shows each person's title, why they're worth contacting, View on LinkedIn, the work email (Copy, Open in Gmail), "I contacted them", and the resume PDF to attach. Deleted `writePerson`, `MsgCtx`, `POST/GET /api/jobs/[id]/more` and `prompts/write-messages.md`; `build-prompt.md` is resume-only.
- **Rule:** don't ship AI writing that speaks for the student unless it's clearly better than what the student would write. Students can write their own; give them the people and the emails.

### 10j. Answered skills landed under the wrong label ("Android: PowerPoint, Google Sheets, Kotlin…")
- **Why:** `buildDiff` put confirmed skills at the start of the FIRST line under the Skills heading, whatever its label.
- **Changed:** `skillsLineIndex` picks the general line (Tools / Software / Other / General), else the last line of the section, and adds the skills at the end of it.
- **Rule:** never put a skill under a label it doesn't belong to.

### 10k. Resume rewrites: patching rules per critique didn't converge (v3 to v5)
- **What broke:** each critique became a new banned word or micro-rule, often tied to one resume ("no Jakob's Law", "40+ at most twice"). The prompts grew past 2,000 words with rules repeated in 3 places, and the writer still opened with "Android app developer", skipped lines (one bullet left in engineer voice), copied phrasing from our own prompt ("comparison cases", "Product builder") and went casual ("Made a second tool").
- **Root causes:** (1) positioning was left to the writer, which falls back on the student's old titles; (2) edits were line by line with a cap, so some lines never got rewritten and the page had two voices; (3) the prompt writer re-worded the student's lines in its own prompt, and the writer copied that wording; (4) prompt bloat and repeated rules cause skipped instructions; (5) "plain" was read as "casual".
- **Changed (draft v6):** a short principle-based rules file and a prompt writer that DECIDES the reader, the positioning, the proof order and the page plan, points at lines instead of re-wording them, states every rule once (600 to 1,000 words), and uses examples from a different field. The writer returns the whole page (`lines`), so every line is considered.
- **Rule:** fix the cause, not the sentence. A rule that names one student's words is a patch.

### 10l. Resume v7: the AI said "all clean" when it wasn't; guardrails varied by job
- **What broke:** v7 asked the writer to report its own read-through (`checks`). All four runs reported nothing left, yet the pages kept "solo" twice, "a person must still check", "AI CRM", mixed full stops and jargon in Skills. Guardrails also differed between jobs because the prompt writer chose which rules to copy into each prompt. And the writer still wrote for nobody: it rearranged old words.
- **Changed (v8):** (1) the prompt writer writes only a short brief (a reader card, positioning fragments, a line-by-line verdict: lead / rewrite / shrink / keep); the standing rules are appended in code, word for word (`<!-- APPEND-RULES -->` marker in the rules file), so every job gets every rule. (2) Code checks the page (`pageProblems` in resume.ts: banned words incl. Skills, "solo"/"alone" more than once, bigger verbs than the resume used, bullets starting with "it", "a person must check" wording, 5-word phrases kept from the old line) and sends any problems back for ONE fix call (`check` in `writerBuilt`). (3) Bullet endings are made consistent in code (`evenEndings`).
- **Rule:** don't trust a model's report of its own work; check in code. Don't let a model decide which rules apply.

### 10m. Resume v8: names and numbers arrived before the reader knew what they were; facts nobody said
- **What broke:** (1) Every entry opened with its strongest proof: Amchi Local's first bullet was "Ran a tester program of 40+ testers…" before the page ever said what Amchi Local is; Otto was never explained; the summary said "a local-train app" with no setup. The cause is general, not one entry: the writer has read the whole resume, so it writes from inside the student's head and forgets the reader knows nothing. The v8 "reader card" made it worse by assuming one known reader. (2) "Worked on an AI CRM" was on the student's saved main resume (that resume's summary ended "…to Sure", so it was an earlier AI rewrite made main). Every prompt treats saved lines as facts, so one invented line became a fact forever. Rajveer never worked on an AI CRM.
- **Changed (v9 drafts):** no assumed reader: write for a smart professional who has never heard of the student, reading top to bottom once. One general rule, "warm up before you claim" (rules Step 3b): every name, number and claim reaches the reader after what it means, either set up inside the same sentence or by an earlier line. The builder writes a **setup map** (every cold spot on the page and where it gets set up); the writer reports `cold_spots`. Not a per-entry rule. (Note: `cold_spots` is the writer's own report, which 10l showed is unreliable; there's no code check for it yet.)
- **Rule:** fix the reading order for a cold reader across the whole page, never one entry. A saved resume can hold AI-written lines; when a student says a line isn't true, the saved resume is what must change.

### 10n. The saved resume taught every job things the student never said
- **What broke:** every resume prompt treats the saved main resume as the student's own words, but the saved resume was written by AI (the upload reader, or an earlier job's rewrite made main). "Worked on an AI CRM" and "trip-planning app" came from there, and every version kept them. The AI also only knew each project through one or two resume lines, so it explained a notes app (everyone knows one) and described Amchi Local in generic words (it never learned what the project really is).
- **Changed:** `/resume/setup`: the student checks each part of the saved resume and writes what's wrong or missing; the AI changes only that part and the note is kept as a fact for every future job. The fix is better input from the student, not more prompt rules.
- **Rule:** the saved resume is only as true as the student has confirmed. Ask the student about their own work; don't make prompts guess it.

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
| 32 | "The notes lead and every point stays in" meant using the student's words as written | "Such a bullshit copy… started with your TED talk stayed with me" | Notes are interpreted (misheard words fixed or dropped); no flattery opener, no weakness, no retelling their story |
| 33 | A rewritten "good" email with the same parts in a set order was fine | "Even the good one is bullshit… there should be no flow… write a story, not a template" | Numbered parts removed; story-first; a fresh prompt is written for every task (build-prompt) |
| 34 | One fixed prompt file per task is enough | "Every time there should be a new prompt… like Morning Espresso… use all the data we scrape" | Two-step writing: build a detailed prompt from all the data, then write |
| 35 | Students can use the AI freely | "Every account should have a token limit… I can't bear everyone's cost" | Per-student AI budget, % shown, warnings at 10%, admin top-ups |
| 36 | In voice, "Clef" meant Claude, then Cloudflare | "I asked about Clef, the ranking model in admin" | Clef is Cloudflare's decision model, used to rank people when "Ranking people" is set to Clef |
| 37 | Proof with numbers and "the job's language" made a good email | "Use low cognitive load, A1/A2 English… why are you mentioning Amchi Local… who writes like this" | Plain English rules in every writing prompt; no own-project names in emails; one or two proofs told as a story |
| 38 | The TED talk was Jitesh's (from voice notes) | "The TED talk was Garima's, I mistakenly said Jitesh" | Examples now use Garima |
| 39 | A LinkedIn note must always be written | "If there is less to personalise, don't do it for the LinkedIn message; it's mandatory for the email" | Note optional with a reason; email always written |
| 40 | "Say what the company does in one clause" helps show understanding | "The first para is just repeating what they do… she is a founder or employee, they don't need to hear that" | Never explain the reader's own company |
| 41 | One strong stat is enough proof | "'I ran a 40-person tester group' is not a story… it's data to a fixed structure" | Proof is one real moment; the writer gets the student's saved answers; asks for a moment when none exists |
| 42 | The emails were close; a few more prompt fixes would get there | "Remove email writing and LinkedIn writing" | Message writing removed; the page shows people, LinkedIn and work emails |
| 43 | Garima was an employee whose role we didn't know | She is a founder | Wrong framing in every draft; another reason to stop guessing |
| 44 | Each critique should become a new rule in the prompt | "Are you just mentioning the facts as rules not to do, or understanding the pattern?" | v6 rebuilt from root causes; tested on four jobs |
| 45 | The saved resume's lines are the student's facts ("AI CRM") | "When did I say that I worked on an AI CRM?" | The saved resume was an earlier AI rewrite; lines on it can be invented |
| 46 | Fix the missing Amchi Local intro with "every entry opens with an intro line" | "This is what we call patching… always warm up sentences… we don't know who is gonna read the resume" | v9: one warm-up rule for the whole page, for an unknown cold reader |
| 47 | Project details should be one more question box in the job flow | "It should not be an input. Create a resume setup page: show the sections, what you extracted, ask if it's right, and a text box" | `/resume/setup` checks the base resume part by part |
| 48 | After upload, show a "Check it part by part" button next to "Looks good" | "Upload and directly see everything part by part… a pop up: don't care about spellings, leave that on us" | Upload opens /resume/setup straight away with that popup |
| 49 | A failed resume rewrite should show a red error with Try again | "Why is it showing error whenever I open the update the resume page… we are intentionally stopping the resume build up" | Calm "not made yet" card + Make it for {company}; reach-out says base vs personalised resume |
| 50 | CLAUDE.md said the resume prompt reads "the person and the team around them" | "Do we look into the company profile and the employees… or is it just a description matcher?" | It never saw the people (runs in parallel). Now the people page shows their skills and the student adds the ones they have |
| 51 | Students wait for admin approval before their first search | "Give every user 5 searches by default and say it with a pop up once they log in" | 5 searches on sign-in (declined students stay out); one-time popup with WhatsApp / email / call, reply in 1–3 hours |
| 52 | Count every person's skills across the company | "We are ranking the skill by relevance to the job profile, right… you might be suggesting the CA skills to a developer" | Only skills the job post names or people in the same work family list (skillMatch.ts) |
| 53 | The setup page could say "add your education" without a place to add it, and a search could start with no resume | "There should always be a space for the mandatory stuff… don't let them start searching without adding resume" | Placeholder cards for every missing mandatory section, warn before save/apply, no search until a resume is in |
| 54 | "AI credits topped up but still blocked" was the old domain | "This is not a bug… I added credits to my other account and was not able to get those credits" | Real bug: +100k added to the old limit, but usage had already run past it (a running call still counts), so the student stayed "used up". A top-up now gives the tokens on top of max(limit, used); the old "budget finished" card hides once the budget is OK |
| 55 | 0 people from one employee run = the company may be fake | "It marked this company as fake… there are people" (NextGen Digital Solutions, linkedin.com/company/ndsonline) | The run came back empty in 3 s; the same input found people minutes later. One retry in Short mode before trusting 0 |
| 56 | "Plain English" (A2–B1, "say jargon in simple words") in the live resume prompt | "It removed IAM… changed Google Cloud infrastructure to basics" | Plain English is about sentence shape (B2), never about removing named skills: the prompts keep every tool/platform/acronym word for word, and code drops any edit that makes a named skill (skills rows, confirmed skills, the job's key skills, acronyms like IAM/GCP) disappear from the page |
| 57 | Admins had an AI token budget like students, and their own row had no top-up (admins aren't "approved" in profiles) | "Why I can't add credits to my own admin account… no limit, only for admin" | Admins have no AI limit (`checkBudget` / `budgetLeft` skip admin emails; usage is still recorded). Students page shows "no limit (admin)" on your own row |
| 58 | Word rules for scams fire on big companies' normal posts | "This job is real and one of the biggest banks and it says it is fake" (linkedin.com/jobs/view/4487131625) | Banks write "processing fees", "security deposits", "WhatsApp banking" as products. The fee rule now needs a fee the candidate pays (registration/joining/interview fee, "you must pay", "pay ₹N to/for"); the WhatsApp rule needs "contact/send … on WhatsApp" or "WhatsApp me/only". A company with its own LinkedIn page and 1,001+ people is never called fake from words in the post (warnings still show), and 0 people found at 1,001+ means our search failed: it carries on as unverified instead of stopping as fake |
| 59 | An empty Apify answer means "nobody found" | HDFC Bank (10,001+) marked fake: `harvestapi/linkedin-company-employees` on account "freefirerajveer365" answered OK with 0 items in 1.5–3 s, three times; the same input on another Apify account found people in 26 s | The sync endpoint returns `[]` for a run that failed at once too. When a run returns 0 items, `runActor` looks at the run itself (`emptyRunReason`): if it failed or stopped early (limit, credit, plan), the log says why and the next account is tried; a credit/limit reason parks the account. A run that "succeeded" with 0 items also gets one other account before we believe it, and its status message goes in the log |
| 60 | A job row from the scraper always has the job | HDFC Bank rerun: the job scraper answered "OK · 2 items" but the job row had no title or company, so step 1 read " at " and the people search was skipped | `fetchLinkedIn` only accepts a job row with a title; otherwise it logs the row's status and reads the post once more |
| 31 | Pushing after every change without asking | "Build it but ask me before pushing" (for that batch) | Asked before that push |

Assumptions that held (not wrong, kept): admin approval before searching; students send messages themselves; Mumbai region; one gradient button per screen; light mode only.
