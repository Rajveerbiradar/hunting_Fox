/* eslint-disable @typescript-eslint/no-explicit-any */
import { adminClient } from "@/lib/supabase/clients";
import { jlog, jobCtx } from "@/lib/joblog";
import { scanMode } from "@/lib/apify";
import { ownKeys } from "@/lib/ownKeys";
import { withoutBlocked } from "@/lib/removals";
import { decide, writer, type Provider } from "@/lib/ai";
import { clefConfig, clefRank } from "@/lib/clef";
import { setting } from "@/lib/secrets";
import { sendEmail } from "@/lib/email";
import { fetchLinkedIn, fetchNaukri, fetchPeople } from "./fetchers";
import { buildMessages, checkCompany, confirmedSkills, knownSkills, mentions, saidNoSkills, sameRole, sameRoleSummary, sizeBand, skillQuestions } from "./rules";
import type { Person, ResumePart, ResumeProfile } from "./types";

const SITE = () => (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
const CACHE_DAYS = 7;

type Ranked = { order: { i: number; why: string; link: Person["link"] }[] };

async function setStep(jobId: string, step: number, detail: string) {
  await jlog("info", `step ${step}`, detail);
  await adminClient().from("jobs").update({ step, step_detail: detail, status: "scanning" }).eq("id", jobId);
}

/**
 * Scan ONE job from start to finish. Never throws: any failure is saved on this
 * job's row only, so other jobs are never affected.
 */
export async function runJob(jobId: string) {
  const sb = adminClient();
  const { data: job, error: readErr } = await sb.from("jobs").select("*").eq("id", jobId).single();
  if (!job) { await jlog("error", "start", `Couldn't read the job row: ${readErr?.message || "not found"}`, jobId); return; }
  if (job.status === "ready") return;
  await sb.from("jobs").update({ attempts: (job.attempts || 0) + 1 }).eq("id", jobId);
  await jobCtx.run({ jobId, started: Date.now() }, async () => {
  await jlog("info", "start", `Attempt ${(job.attempts || 0) + 1} · ${job.portal} · ${job.url}`);
  try {
    await scan(job);
    await jlog("info", "done", "Finished");
  } catch (e: any) {
    const msg = String(e?.message || e);
    await jlog("error", "failed", `${msg}${e?.stack ? `\n${String(e.stack).split("\n").slice(1, 6).join("\n")}` : ""}`);
    await sb.from("jobs").update({
      status: "failed",
      error: msg.includes("JOB_NOT_FOUND") ? "not_found" : msg.includes("OWN_KEY_OUT") ? "own_key_out" : msg.slice(0, 300),
      finished_at: new Date().toISOString(),
    }).eq("id", jobId);
    await sb.from("events").insert({ user_id: job.user_id, job_id: jobId, name: "failed" });
  }
  });
}

async function scan(job: any) {
  const sb = adminClient();
  const [{ data: profile }, own] = await Promise.all([
    sb.from("profiles").select("*").eq("id", job.user_id).single(),
    ownKeys(job.user_id),
  ]);
  // A student's own Apify key pays for the search, so it doesn't count toward their limit.
  let apifyKey: string | null = own.apify?.token || null;
  const mode = apifyKey ? "full" : await scanMode();
  await jlog("info", "setup", `Mode ${mode} · ${apifyKey ? "student's own Apify key" : "shared Apify accounts"} · ${own.ai ? "student's own AI key" : "shared AI providers"} · resume ${profile?.resume_profile ? "yes" : "no"}`);
  if (apifyKey !== null) await sb.from("jobs").update({ own_key: true }).eq("id", job.id);

  // Own key ran out mid-search: use their free searches if they said so, else stop.
  const withOwn = async <T,>(fn: (k: string | null) => Promise<T>): Promise<T> => {
    try {
      return await fn(apifyKey);
    } catch (e: any) {
      if (!apifyKey || !e?.ownKeyOut) throw e;
      await sb.from("user_keys").update({ ok: false }).eq("user_id", job.user_id).eq("kind", "apify");
      if (own.apify?.fallback !== "free") throw new Error("OWN_KEY_OUT");
      apifyKey = null;
      await sb.from("jobs").update({ own_key: false }).eq("id", job.id);
      return fn(null);
    }
  };

  // 1. Read the job
  await setStep(job.id, 0, "Reading the job post");
  const { job: jd, company } = await withOwn((k) => (job.portal === "naukri" ? fetchNaukri(job.url, k) : fetchLinkedIn(job.url, k)));
  await sb.from("jobs").update({ title: jd.title, company: company.name }).eq("id", job.id);
  await setStep(job.id, 1, `${jd.title} at ${company.name}${jd.location ? `, ${jd.location}` : ""}`);

  // 2. Check the company (rules, no AI)
  const { checks, verdict } = checkCompany(jd, company);
  const band = sizeBand(company);
  const { data: report } = await sb
    .from("reports")
    .upsert({ job_id: job.id, job_data: jd, company_data: company, checks, verdict, size_band: band })
    .select("share_token")
    .single();
  if (verdict === "closed" || verdict === "fake") {
    await sb.from("jobs").update({ status: verdict, step: 5, finished_at: new Date().toISOString() }).eq("id", job.id);
    return;
  }
  const warns = checks.filter((c) => c.result === "warn").length;
  await setStep(job.id, 2, verdict === "agency" ? "A recruitment agency posted this job, so we'll skip finding people" : warns ? `Looks real, with ${warns} thing${warns > 1 ? "s" : ""} to know` : "Their LinkedIn page, website and the person who posted it all check out");

  // 3. People (cached per company for 7 days, shared across students)
  let people: Person[] = [];
  let cachedRanking: Ranked | null = null;
  // Per company AND role: a designer search and a developer search at the same company want different people.
  const base = company.domain || company.linkedinUrl;
  const key = base ? `${base}#${jd.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60)}` : undefined;
  if (verdict !== "agency" && key) {
    const { data: cache } = await sb.from("company_cache").select("*").eq("key", key).maybeSingle();
    const fresh = cache && Date.now() - new Date(cache.fetched_at).getTime() < CACHE_DAYS * 86400_000;
    if (fresh && Array.isArray(cache.people) && cache.people.length) {
      people = cache.people;
      cachedRanking = cache.ranking?.title === jd.title ? cache.ranking.value : null;
    } else {
      people = await withOwn((k) => fetchPeople(company, jd.title, mode, k));
      await sb.from("company_cache").upsert({ key, company_data: company, people, ranking: null, fetched_at: new Date().toISOString() });
    }
  }
  people = await withoutBlocked(people).catch(() => people);
  checks.push({ group: "The people we found", text: people.length ? `${people.length} ${people.length === 1 ? "person" : "people"} from public LinkedIn profiles` : "No one with a public profile we could find", result: people.length ? "pass" : "unknown" });
  // Nobody public works there and nobody we can see posted the job. A big mismatch (page says 51+ people,
  // we find none) is a strong fake sign: stop (no resume work, doesn't use a search). A small company
  // can be real with no public staff, so warn and carry on.
  let finalVerdict = verdict;
  if (verdict !== "agency" && !people.length && !jd.poster?.name) {
    const size = company.sizeText ? `Their LinkedIn page says ${company.sizeText}, but we` : "We";
    checks.push({ group: "The people we found", text: `${size} couldn't find a single person with a public profile who works there, and we couldn't see who posted the job`, result: "warn" });
    if ((company.sizeMin ?? 0) >= 51) {
      await jlog("warn", "check", `Stopped: 0 people found and no poster, page says ${company.sizeText}`);
      await sb.from("reports").update({ checks, verdict: "fake" }).eq("job_id", job.id);
      await sb.from("jobs").update({ status: "fake", error: "no_people", step: 5, finished_at: new Date().toISOString() }).eq("id", job.id);
      return;
    }
    finalVerdict = "unverified";
  } else if (verdict !== "agency" && people.length <= 1 && !jd.poster?.name) {
    checks.push({ group: "The people we found", text: `Only ${people.length === 1 ? "one person says they work" : "no one says they work"} there, and we couldn't see who posted the job. Small startups can look like this, but fake jobs do too. Never pay a fee, and check them on Google before you share your details`, result: "warn" });
    finalVerdict = "unverified";
  }
  if (finalVerdict !== verdict) await sb.from("reports").update({ verdict: finalVerdict }).eq("job_id", job.id);
  if (people.length) checks.push({ group: "The company", text: `Real people with public LinkedIn profiles work there`, result: "pass" });
  const withEmail = people.filter((p) => p.email).length;
  if (withEmail) checks.push({ group: "The people we found", text: `Work email addresses for ${withEmail} of them`, result: "pass" });
  await setStep(job.id, 3, people.length ? `Found ${people.length} ${people.length === 1 ? "person" : "people"}, most active first` : "We couldn't find anyone public here");

  // 4. In parallel: resume changes (writer) and people ranking (decision model)
  const rp: ResumeProfile | null = profile?.resume_profile || null;
  const lines: string[] = (profile?.resume_text || "").split("\n").filter((l: string) => l.trim());
  const student = {
    headline: rp?.headline,
    skills: knownSkills(profile || {}),
    education: (profile?.education?.length ? profile.education : rp?.education || []).map((e: any) => e.school),
    past_companies: [],
  };

  // Resume changes: the job post first (exact ATS words), same-role people only as a hint.
  // Nothing new goes in without the student's yes: unconfirmed skills become questions, never edits.
  const resumeTask = (async (): Promise<ResumePart | null> => {
    if (!lines.length) return null;
    const confirmed = confirmedSkills(profile || {});
    const saidNo = saidNoSkills(profile || {});
    const peers = sameRole(jd.title, people);
    await jlog("info", "resume", `Same role as "${jd.title}": ${peers.length} of ${people.length} people`);
    type Out = { keywords?: string[]; summary?: string; summary_reason?: string; edits?: ResumePart["edits"]; ask?: ResumePart["skill_questions"]; suggestions?: ResumePart["suggestions"] };
    const out = await writer<Out>("resume-changes", {
      resume_lines: lines,
      confirmed_skills: confirmed,
      said_no: saidNo,
      job: { title: jd.title, key_skills: jd.keySkills, description: jd.description.slice(0, 6000) },
      same_role: sameRoleSummary(peers),
    }, 2000, own.ai).catch(async (e) => { await jlog("warn", "resume", `Resume changes skipped: ${String(e?.message || e).slice(0, 200)}`); return null; });

    const resumeText = lines.join("\n");
    const have = (t: string) => mentions(resumeText, t) || confirmed.some((c) => c.trim().toLowerCase() === t.trim().toLowerCase());
    const no = new Set(saidNo.map((x) => x.trim().toLowerCase()));

    // Every skill-like word we know about for this job. An edit that brings in one the student hasn't got is dropped.
    const vocab = [...new Set([...(out?.keywords || []), ...jd.keySkills, ...peers.flatMap((p) => p.skills), ...(out?.ask || []).map((q) => q.skill)].map((x) => String(x || "").trim()).filter((x) => x.length > 1))];
    const edits = (out?.edits || []).filter((e) => {
      if (!e?.old || !e?.new || e.new === e.old || !lines.includes(e.old)) return false;
      const sneaked = vocab.find((t) => mentions(e.new, t) && !mentions(e.old, t) && !have(t));
      if (sneaked) { void jlog("info", "resume", `Dropped an edit that added "${sneaked}" without asking`); return false; }
      return true;
    }).slice(0, 5);

    // The summary, written for this job. Replaces the resume's summary lines, or is added if there isn't one.
    let summary_insert: ResumePart["summary_insert"];
    const sum = (out?.summary || "").replace(/\s*—\s*/g, ", ").replace(/\s+/g, " ").trim();
    const sneakedSum = sum && vocab.find((t) => mentions(sum, t) && !have(t));
    if (sneakedSum) void jlog("info", "resume", `Dropped the new summary: it added "${sneakedSum}" without asking`);
    if (sum && sum.split(" ").length >= 20 && !sneakedSum) {
      const reason = out?.summary_reason || "Written for this job from what's already on your resume";
      const h = lines.findIndex((l) => /^## (professional )?(summary|profile|about( me)?|objective|career objective)\b/i.test(l));
      if (h >= 0) {
        const mine: string[] = [];
        for (let i = h + 1; i < lines.length && !lines[i].startsWith("## "); i++) mine.push(lines[i]);
        const kept = edits.filter((e) => !mine.includes(e.old));
        edits.length = 0;
        edits.push(...(mine.length ? [{ old: mine[0], new: sum, reason }, ...mine.slice(1).map((o) => ({ old: o, new: "", reason: "" }))] : []), ...kept);
        if (!mine.length) summary_insert = { text: sum, reason };
      } else summary_insert = { text: sum, reason };
    }

    const asked = new Set<string>();
    const skill_questions = (out ? out.ask || [] : skillQuestions(jd, confirmed, saidNo))
      .filter((q) => q?.skill && !have(q.skill) && !no.has(q.skill.trim().toLowerCase()))
      .filter((q) => { const k = q.skill.trim().toLowerCase(); if (asked.has(k)) return false; asked.add(k); return true; })
      .slice(0, 5)
      .map((q) => ({ skill: q.skill.trim(), why: q.why || "The job post asks for it." }));

    const keywords = (out?.keywords?.length ? out.keywords : jd.keySkills).slice(0, 12).map((t) => String(t).trim()).filter(Boolean)
      .map((term) => ({ term, in_resume: have(term) || edits.some((e) => mentions(e.new, term)) || mentions(sum, term) }));

    return { base_lines: lines, edits, skill_questions, suggestions: (out?.suggestions || []).slice(0, 3), keywords, summary_insert };
  })();

  const rankTask = (async (): Promise<Ranked> => {
    if (people.length <= 1) return { order: people.map((_, i) => ({ i, why: "", link: null })) };
    if (cachedRanking && !rp) return cachedRanking;
    // Clef (Cloudflare decision model) when it's picked for ranking in /admin; the chat providers are the fallback.
    if ((await setting("ranker_provider", "")) === "clef") {
      const cfg = await clefConfig();
      if (cfg) {
        try {
          return await clefRank(cfg, { title: jd.title, key_skills: jd.keySkills, company: company.name, size_band: band }, student, people);
        } catch (e: any) {
          await jlog("warn", "rank", `Clef failed, using the chat model instead: ${String(e?.message || e).slice(0, 200)}`);
        }
      } else await jlog("warn", "rank", "Clef is picked for ranking but isn't set up in /admin → API keys. Using the chat model.");
    }
    return decide<Ranked>("rank-people", {
      job: { title: jd.title, key_skills: jd.keySkills, company: company.name, size_band: band },
      student,
      people: people.map((p, i) => ({ i, title: p.title, months: p.months, activity: p.active, schools: p.schools, past_companies: p.pastCompanies, headline: p.headline })),
    }, own.ai).catch(async (e) => { await jlog("warn", "rank", `Ranking skipped, keeping found order: ${String(e?.message || e).slice(0, 200)}`); return { order: people.map((_, i) => ({ i, why: "", link: null })) }; });
  })();

  const [resume, ranked] = await Promise.all([resumeTask, rankTask]);
  if (key && people.length) await sb.from("company_cache").update({ ranking: { title: jd.title, value: ranked } }).eq("key", key);

  const seen = new Set<number>();
  const ordered: Person[] = [];
  (ranked.order || []).forEach((o) => {
    if (seen.has(o.i) || !people[o.i]) return;
    seen.add(o.i);
    ordered.push({ ...people[o.i], why: o.why || people[o.i].why, link: o.link || null });
  });
  people.forEach((p, i) => !seen.has(i) && ordered.push(p));
  // People with an official email at this company are real leads: right after the poster.
  ordered.sort((a, b) => Number(!!b.email && !!b.emailFound) - Number(!!a.email && !!a.emailFound));
  // The person who posted the job is the best person to message: always first.
  if (jd.poster?.name) {
    const pn = jd.poster.name.toLowerCase();
    const at = ordered.findIndex((p) => p.name.toLowerCase() === pn);
    const poster: Person = at >= 0 ? ordered.splice(at, 1)[0] : {
      id: "poster", name: jd.poster.name, first: jd.poster.name.split(" ")[0], title: jd.poster.title || "Posted this job",
      active: "Active", headline: jd.poster.title, schools: [], pastCompanies: [], skills: [], profileUrl: jd.poster.url,
    };
    ordered.unshift({ ...poster, link: poster.link || { type: "hiring", detail: "Posted this job" }, why: "Posted this job, so they're the one hiring for it." });
  }

  await setStep(job.id, 4, resume ? `${resume.edits.length} changes${resume.skill_questions.length ? `, and ${resume.skill_questions.length} quick questions for you` : ""}` : "No resume yet, so no resume changes");

  // 5. The job is ready as soon as the resume changes and the people list are done.
  // Messages are written right after, for everyone at once (8 at a time, top people first);
  // each person's card fills in on the page the moment theirs is saved.
  const hasResume = !!(rp || profile?.resume_text);
  const ctx: MsgCtx = {
    role: jd.title,
    company: company.name,
    big: band === "big",
    studentName: profile?.name || rp?.name || "",
    headline: rp?.headline,
    resumeLink: hasResume ? `${SITE()}/r/${report?.share_token}` : "",
    portfolio: (profile?.links || [])[0]?.url,
    student: { skills: student.skills, projects: rp?.projects, education: student.education, resume: lines },
    job: { key_skills: jd.keySkills, description: jd.description },
  };
  const pending = ordered.map((p) => ({ ...p, written: false, note: undefined, subject: undefined, body: undefined }));
  await sb.from("reports").update({ people: pending, resume, checks }).eq("job_id", job.id);
  await sb.from("jobs").update({ status: "ready", step: 5, step_detail: pending.length ? `Writing ${pending.length === 1 ? "the message" : `all ${pending.length} messages`} now. Each one shows up as soon as it's ready` : "No one to message", finished_at: new Date().toISOString() }).eq("id", job.id);
  await sb.from("events").insert({ user_id: job.user_id, job_id: job.id, name: "finished" });
  if (profile?.email_ready && profile?.email)
    await sendEmail(profile.email, `${company.name} is ready`, `Here's what to do for the ${jd.title} job at ${company.name}:\n${SITE()}/jobs/${job.id}\n\nHunting Fox never sends anything for you.`);

  await writeMany(job.id, pending, ctx, rp, own.ai);
}

const PARALLEL = 8;
const PER_PERSON_MS = 90_000;

/**
 * Write messages for many people at once: PARALLEL at a time, in list order (best first).
 * Each finished person is saved straight away, so the page shows it without waiting for the rest.
 * A person that takes longer than PER_PERSON_MS gets the plain version so nobody waits forever.
 * Never throws.
 */
export async function writeMany(jobId: string, targets: Person[], ctx: MsgCtx, rp: ResumeProfile | null, ownAi?: Provider | null) {
  if (!targets.length) return [];
  const t0 = Date.now();
  const sb = adminClient();
  let chain: Promise<unknown> = Promise.resolve();
  // Saves run one after another, each re-reading the list and replacing only this person.
  const save = (p: Person) => (chain = chain.then(async () => {
    const { data } = await sb.from("reports").select("people").eq("job_id", jobId).single();
    const list: Person[] = (data?.people || []).map((x: Person) => (x.id === p.id ? p : x));
    await sb.from("reports").update({ people: list }).eq("job_id", jobId);
  }).catch((e) => jlog("warn", "messages", `Couldn't save ${p.first}'s message: ${String(e?.message || e).slice(0, 160)}`)));
  const queue = [...targets];
  const out: Person[] = [];
  const worker = async () => {
    while (queue.length) {
      const p = queue.shift()!;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const late = new Promise<Person>((res) => { timer = setTimeout(() => {
        void jlog("warn", "messages", `${p.first} took over ${PER_PERSON_MS / 1000}s, using the plain version`);
        res({ ...p, line: undefined, ...buildMessages({ ...p, line: undefined }, ctx), written: true });
      }, PER_PERSON_MS); });
      const w = await Promise.race([writePerson(p, ctx, rp, ownAi), late]).catch(() => ({ ...p, ...buildMessages({ ...p, line: undefined }, ctx), written: true }));
      clearTimeout(timer);
      out.push(w);
      await save(w);
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, targets.length) }, worker));
  await chain;
  await jlog("info", "messages", `Wrote ${out.length} ${out.length === 1 ? "message" : "messages"} in ${Math.round((Date.now() - t0) / 1000)}s (${PARALLEL} at a time)`);
  return out;
}

export type MsgCtx = Parameters<typeof buildMessages>[1] & {
  student?: { skills?: string[]; projects?: { title: string; detail: string }[]; education?: string[]; resume?: string[] };
  job?: { key_skills?: string[]; description?: string };
};

/**
 * Write one person's LinkedIn note and email with AI, from their profile and the student's real details.
 * Falls back to the plain template only if every AI provider fails.
 */
export async function writePerson(p: Person, ctx: MsgCtx, rp: ResumeProfile | null, ownAi?: Provider | null): Promise<Person> {
  try {
    const out = await writer<{ note: string; subject: string; body: string }>("write-messages", {
      job: { title: ctx.role, company: ctx.company, key_skills: ctx.job?.key_skills?.slice(0, 12), description: ctx.job?.description?.slice(0, 2500), ask: ctx.big ? "referral" : "pass_on" },
      student: {
        name: ctx.studentName,
        headline: ctx.headline || rp?.headline,
        education: ctx.student?.education || (rp?.education || []).map((e) => e.school),
        skills: (ctx.student?.skills || rp?.skills || []).slice(0, 25),
        portfolio: ctx.portfolio || null,
        resume: (ctx.student?.resume || []).join("\n").slice(0, 5000) || null,
        projects: ctx.student?.resume?.length ? undefined : (ctx.student?.projects || rp?.projects || []).slice(0, 4),
      },
      person: { first: p.first, title: p.title, months_at_company: p.months, headline: p.headline, about: p.about?.slice(0, 1200), skills: p.skills?.slice(0, 15), schools: p.schools, past_companies: p.pastCompanies, activity: p.active },
      connection: p.link || null,
      has_resume: !!ctx.resumeLink,
    }, 1400, ownAi);
    let note = (out.note || "").trim();
    const subject = (out.subject || "").trim().replace(/\s*—\s*/g, ", ").slice(0, 90);
    let body = (out.body || "").trim();
    if (!note || !body) throw new Error("empty message");
    // The note never carries a link (a bare link from a stranger looks like spam). Keep it within LinkedIn's 200.
    note = note.replace(/https?:\/\/\S+/g, "").replace(/\s*—\s*/g, ", ").replace(/\s+/g, " ").trim();
    if (note.length > 200) note = note.slice(0, 199).replace(/\s+\S*$/, "").replace(/[,;:]$/, "") + ".";
    // The resume is attached by the student. Never "happy to send" / "will send": say it's attached.
    body = body.replace(/https?:\/\/\S*\/r\/\S+/g, "").replace(/\[RESUME\]/g, "").replace(/\s*—\s*/g, ", ");
    body = body.replace(/[^.\n]*\b(happy to (send|share)|(can|will|could) (send|share)|let me know if you('d| would)? like)[^.\n]*(my )?(resume|cv)[^.\n]*\.?/gi, "I've attached my resume.");
    if (!/attach/i.test(body)) body = body.replace(/\n\n([^\n]*(thank|thanks|regards|best)[^\n]*,?\s*\n[^\n]+)\s*$/i, "\n\nI've attached my resume.\n\n$1");
    // The online copy goes on its own labelled line just before the sign-off.
    if (ctx.resumeLink && !body.includes(ctx.resumeLink)) {
      const at = body.search(/\n\n[^\n]*(thank|thanks|regards|best|cheers)[^\n]*,?\s*\n[^\n]+\s*$/i);
      const line = `My resume online: ${ctx.resumeLink}`;
      body = at > 0 ? `${body.slice(0, at)}\n\n${line}${body.slice(at)}` : `${body}\n\n${line}`;
    }
    body = body.replace(/\n{3,}/g, "\n\n").trim();
    return { ...p, line: undefined, note, subject: subject || `${ctx.role} at ${ctx.company}`, body, written: true };
  } catch (e: any) {
    await jlog("warn", "messages", `AI couldn't write for ${p.first}, using the plain version: ${String(e?.message || e).slice(0, 200)}`);
    const m = buildMessages({ ...p, line: undefined }, ctx);
    return { ...p, line: undefined, ...m, written: true };
  }
}
