/* eslint-disable @typescript-eslint/no-explicit-any */
import { adminClient } from "@/lib/supabase/clients";
import { scanMode } from "@/lib/apify";
import { ownKeys } from "@/lib/ownKeys";
import { decide, writer, type Provider } from "@/lib/ai";
import { sendEmail } from "@/lib/email";
import { fetchLinkedIn, fetchNaukri, fetchPeople } from "./fetchers";
import { buildMessages, checkCompany, knownSkills, sizeBand, skillQuestions, teamSummary } from "./rules";
import type { Person, ResumePart, ResumeProfile } from "./types";

const SITE = () => (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
const CACHE_DAYS = 7;

type Ranked = { order: { i: number; why: string; link: Person["link"] }[] };

async function setStep(jobId: string, step: number, detail: string) {
  await adminClient().from("jobs").update({ step, step_detail: detail, status: "scanning" }).eq("id", jobId);
}

/**
 * Scan ONE job from start to finish. Never throws: any failure is saved on this
 * job's row only, so other jobs are never affected.
 */
export async function runJob(jobId: string) {
  const sb = adminClient();
  const { data: job } = await sb.from("jobs").select("*").eq("id", jobId).single();
  if (!job || job.status === "ready") return;
  await sb.from("jobs").update({ attempts: (job.attempts || 0) + 1 }).eq("id", jobId);
  try {
    await scan(job);
  } catch (e: any) {
    console.error("scan failed", jobId, e);
    const msg = String(e?.message || e);
    await sb.from("jobs").update({
      status: "failed",
      error: msg.includes("JOB_NOT_FOUND") ? "not_found" : msg.includes("OWN_KEY_OUT") ? "own_key_out" : msg.slice(0, 300),
      finished_at: new Date().toISOString(),
    }).eq("id", jobId);
    await sb.from("events").insert({ user_id: job.user_id, job_id: jobId, name: "failed" });
  }
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

  const resumeTask = (async (): Promise<ResumePart | null> => {
    if (!lines.length) return null;
    const out = await writer<{ edits: ResumePart["edits"]; suggestions: ResumePart["suggestions"] }>("resume-changes", {
      resume_lines: lines,
      job: { title: jd.title, key_skills: jd.keySkills, description: jd.description.slice(0, 3000) },
      team: teamSummary(people),
    }, 1200, own.ai).catch(() => ({ edits: [], suggestions: [] }));
    // Anti-invention guard: an edit must replace a line that really exists.
    const edits = (out.edits || []).filter((e) => lines.includes(e.old) && e.new && e.new !== e.old).slice(0, 4);
    return {
      base_lines: lines,
      edits,
      skill_questions: skillQuestions(jd, people, student.skills),
      suggestions: (out.suggestions || []).slice(0, 3),
    };
  })();

  const rankTask = (async (): Promise<Ranked> => {
    if (people.length <= 1) return { order: people.map((_, i) => ({ i, why: "", link: null })) };
    if (cachedRanking && !rp) return cachedRanking;
    return decide<Ranked>("rank-people", {
      job: { title: jd.title, key_skills: jd.keySkills, company: company.name, size_band: band },
      student,
      people: people.map((p, i) => ({ i, title: p.title, months: p.months, activity: p.active, schools: p.schools, past_companies: p.pastCompanies, headline: p.headline })),
    }, own.ai).catch(() => ({ order: people.map((_, i) => ({ i, why: "", link: null })) }));
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

  await setStep(job.id, 4, resume ? `${resume.edits.length} changes${resume.skill_questions.length ? `, and ${resume.skill_questions.length} quick questions for you` : ""}` : "No resume yet, so no resume changes");

  // 5. Messages: only the top 2 now. Template by code; AI line only with a real connection.
  const top = ordered.slice(0, 2);
  const ctx = {
    role: jd.title,
    company: company.name,
    big: band === "big",
    studentName: profile?.name || rp?.name || "",
    headline: rp?.headline,
    resumeLink: `${SITE()}/r/${report?.share_token}`,
    portfolio: (profile?.links || [])[0]?.url,
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

export async function writePerson(p: Person, ctx: Parameters<typeof buildMessages>[1], rp: ResumeProfile | null, ownAi?: Provider | null): Promise<Person> {
  let line: string | undefined;
  if (p.link) {
    try {
      const out = await writer<{ line: string }>("personal-line", {
        student_headline: rp?.headline,
        job: ctx.role,
        company: ctx.company,
        person: { first: p.first, title: p.title },
        link: p.link,
      }, 120, ownAi);
      line = out.line?.trim().slice(0, 140);
    } catch {
      line = undefined;
    }
  }
  const m = buildMessages({ ...p, line }, ctx);
  return { ...p, line, ...m, written: true };
}
