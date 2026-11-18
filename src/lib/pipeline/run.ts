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
  const key = company.domain || company.linkedinUrl;
  if (verdict !== "agency" && key) {
    const { data: cache } = await sb.from("company_cache").select("*").eq("key", key).maybeSingle();
    const fresh = cache && Date.now() - new Date(cache.fetched_at).getTime() < CACHE_DAYS * 86400_000;
    if (fresh && Array.isArray(cache.people)) {
      people = cache.people;
      cachedRanking = cache.ranking?.title === jd.title ? cache.ranking.value : null;
    } else {
      people = await withOwn((k) => fetchPeople(company, jd.title, mode, k));
      await sb.from("company_cache").upsert({ key, company_data: company, people, ranking: null, fetched_at: new Date().toISOString() });
    }
  }
  people = await withoutBlocked(people).catch(() => people);
  checks.push({ group: "The people we found", text: people.length ? `${people.length} ${people.length === 1 ? "person" : "people"} from public LinkedIn profiles` : "No one with a public profile we could find", result: people.length ? "pass" : "unknown" });
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
    type Out = { keywords?: string[]; edits?: ResumePart["edits"]; ask?: ResumePart["skill_questions"]; suggestions?: ResumePart["suggestions"] };
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

    const asked = new Set<string>();
    const skill_questions = (out ? out.ask || [] : skillQuestions(jd, confirmed, saidNo))
      .filter((q) => q?.skill && !have(q.skill) && !no.has(q.skill.trim().toLowerCase()))
      .filter((q) => { const k = q.skill.trim().toLowerCase(); if (asked.has(k)) return false; asked.add(k); return true; })
      .slice(0, 5)
      .map((q) => ({ skill: q.skill.trim(), why: q.why || "The job post asks for it." }));

    const keywords = (out?.keywords?.length ? out.keywords : jd.keySkills).slice(0, 12).map((t) => String(t).trim()).filter(Boolean)
      .map((term) => ({ term, in_resume: have(term) || edits.some((e) => mentions(e.new, term)) }));

    return { base_lines: lines, edits, skill_questions, suggestions: (out?.suggestions || []).slice(0, 3), keywords };
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

  // 5. Messages: the top 2 now (the rest when the student asks), written by AI from each person's profile.
  // The resume link goes in only if the student has a resume.
  const top = ordered.slice(0, 2);
  const hasResume = !!(rp || profile?.resume_text);
  const ctx: MsgCtx = {
    role: jd.title,
    company: company.name,
    big: band === "big",
    studentName: profile?.name || rp?.name || "",
    headline: rp?.headline,
    resumeLink: hasResume ? `${SITE()}/r/${report?.share_token}` : "",
    portfolio: (profile?.links || [])[0]?.url,
    student: { skills: student.skills, projects: rp?.projects, education: student.education },
    job: { key_skills: jd.keySkills, description: jd.description },
  };
  const written = await Promise.all(top.map((p) => writePerson(p, ctx, rp, own.ai)));
  const people_final = [...written, ...ordered.slice(2)];
  const notes = written.filter((p) => p.note).length;
  const emails = written.filter((p) => p.email).length;
  await setStep(job.id, 5, `${notes} LinkedIn notes${emails ? ` and ${emails} emails` : ""}, ready to copy`);

  await sb.from("reports").update({ people: people_final, resume, checks }).eq("job_id", job.id);
  await sb.from("jobs").update({ status: "ready", step: 5, finished_at: new Date().toISOString() }).eq("id", job.id);
  await sb.from("events").insert({ user_id: job.user_id, job_id: job.id, name: "finished" });
  if (profile?.email_ready && profile?.email)
    await sendEmail(profile.email, `${company.name} is ready`, `Here's what to do for the ${jd.title} job at ${company.name}:\n${SITE()}/jobs/${job.id}\n\nHunting Fox never sends anything for you.`);
}

type MsgCtx = Parameters<typeof buildMessages>[1] & {
  student?: { skills?: string[]; projects?: { title: string; detail: string }[]; education?: string[] };
  job?: { key_skills?: string[]; description?: string };
};

/**
 * Write one person's LinkedIn note and email with AI, from their profile and the student's real details.
 * Falls back to the plain template only if every AI provider fails.
 */
export async function writePerson(p: Person, ctx: MsgCtx, rp: ResumeProfile | null, ownAi?: Provider | null): Promise<Person> {
  try {
    const out = await writer<{ note: string; subject: string; body: string }>("write-messages", {
      job: { title: ctx.role, company: ctx.company, key_skills: ctx.job?.key_skills?.slice(0, 12), description: ctx.job?.description?.slice(0, 1200), ask: ctx.big ? "referral" : "pass_on" },
      student: {
        name: ctx.studentName,
        headline: ctx.headline || rp?.headline,
        skills: (ctx.student?.skills || rp?.skills || []).slice(0, 25),
        projects: (ctx.student?.projects || rp?.projects || []).slice(0, 4),
        education: ctx.student?.education || (rp?.education || []).map((e) => e.school),
        portfolio: ctx.portfolio || null,
      },
      person: { first: p.first, title: p.title, months_at_company: p.months, headline: p.headline, about: p.about, skills: p.skills?.slice(0, 15), schools: p.schools, past_companies: p.pastCompanies, activity: p.active },
      connection: p.link || null,
      resume_link: ctx.resumeLink || null,
    }, 900, ownAi);
    let note = (out.note || "").trim();
    const subject = (out.subject || "").trim().slice(0, 90);
    let body = (out.body || "").trim();
    if (!note || !body) throw new Error("empty message");
    // The model wrote a link that isn't ours, or forgot ours: fix it. Keep the note within LinkedIn's 200.
    note = note.replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim();
    if (ctx.resumeLink) {
      const room = 200 - ctx.resumeLink.length - 1;
      if (note.length > room) note = note.slice(0, room).replace(/[\s,;:]+\S*$/, "").replace(/[,;:]$/, "") + ".";
      note = `${note} ${ctx.resumeLink}`;
    } else if (note.length > 200) {
      note = note.slice(0, 199).replace(/\s+\S*$/, "") + ".";
    }
    if (!ctx.resumeLink) body = body.replace(/https?:\/\/\S*\/r\/\S+/g, "").trim();
    return { ...p, line: undefined, note, subject: subject || `${ctx.role} at ${ctx.company}`, body, written: true };
  } catch (e: any) {
    await jlog("warn", "messages", `AI couldn't write for ${p.first}, using the plain version: ${String(e?.message || e).slice(0, 200)}`);
    const m = buildMessages({ ...p, line: undefined }, ctx);
    return { ...p, line: undefined, ...m, written: true };
  }
}
