import type { Check, CompanyData, JobData, Person, ResumeProfile } from "./types";

/** Company check with fixed rules. No AI. Missing facts become "unknown", never guesses. */
export function checkCompany(job: JobData, company: CompanyData) {
  const checks: Check[] = [];
  const red: string[] = [];
  const text = `${job.title}\n${job.description}`.toLowerCase();

  if (company.linkedinUrl) checks.push({ group: "The company", text: `Has a LinkedIn company page${company.sizeText ? ` (${company.sizeText})` : ""}`, result: "pass" });
  else checks.push({ group: "The company", text: "No LinkedIn company page found", result: "warn" });

  // Anyone can type a website into a LinkedIn page, so a listed website alone proves nothing.
  if (company.website) checks.push({ group: "The company", text: `Their LinkedIn page lists the website ${company.domain || company.website}. Anyone can list a website, so this alone doesn't prove it's theirs`, result: "unknown" });
  else checks.push({ group: "The company", text: "No website listed", result: "unknown" });

  if (company.founded) {
    const age = new Date().getFullYear() - company.founded;
    checks.push({ group: "The company", text: `Founded in ${company.founded}`, result: age >= 1 ? "pass" : "warn" });
  }
  if (company.rating != null)
    checks.push({ group: "The company", text: `Rated ${company.rating} on AmbitionBox${company.reviews ? ` from ${company.reviews} reviews` : ""}`, result: company.rating >= 3 ? "pass" : "warn" });

  if (job.poster?.name)
    checks.push({
      group: "Who posted the job",
      text: job.poster.worksThere ? `Posted by ${job.poster.name}${job.poster.title ? `, ${job.poster.title}` : ""}` : `Posted by ${job.poster.name}. Their LinkedIn headline doesn't name the company, so we couldn't confirm they work there`,
      result: job.poster.worksThere ? "pass" : "unknown",
    });
  else checks.push({ group: "Who posted the job", text: "We couldn't see who posted it", result: "unknown" });

  if (/(registration|training|security|joining|processing)\s*(fee|deposit|charges?)|pay\s*(rs\.?|₹|inr)\s*\d+/.test(text)) red.push("The post asks you to pay a fee. Real jobs never ask you to pay.");
  if (/whatsapp\s*(only|me|on)|contact.*whatsapp/.test(text)) red.push("It asks you to contact them only on WhatsApp.");
  if (/@(gmail|yahoo|outlook|hotmail)\.com/.test(text)) red.push("It uses a personal email address for hiring.");
  if (/paid\s*task|task.*before.*selection/.test(text)) red.push("It asks you to do a paid task to be selected.");
  red.forEach((r) => checks.push({ group: "Who posted the job", text: r, result: "warn" }));

  const closed = /position filled|no longer accepting|closed/i.test(job.title) || /closed|filled/i.test(job.jobState || "");
  const fake = red.some((r) => r.includes("fee")) || (red.length >= 2) || (!company.linkedinUrl && !company.website && red.length >= 1);
  const verdict = closed ? "closed" : job.consultant ? "agency" : fake ? "fake" : company.linkedinUrl || company.website || company.rating != null ? "genuine" : "unverified";
  return { checks, verdict, red } as const;
}

export function sizeBand(company: CompanyData): "small" | "big" {
  // LinkedIn gives ranges like "201-500 employees". Reach out first only from 501+.
  return (company.sizeMin ?? 0) >= 501 ? "big" : "small";
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9+#.]/g, "");

/** Skills the team or job lists that the student hasn't told us about. Code only. */
/** Fallback questions when the AI is down: only skills the job post itself lists that the student hasn't confirmed or turned down. */
export function skillQuestions(job: JobData, known: string[], answered: string[] = []) {
  const skip = new Set([...known, ...answered].map(norm));
  return job.keySkills
    .filter((s) => norm(s) && !skip.has(norm(s)))
    .slice(0, 5)
    .map((skill) => ({ skill, why: "The job post asks for it." }));
}

const SENIORITY = /\b(senior|sr|junior|jr|intern|internship|trainee|associate|graduate|fresher|entry|level|lead|principal|staff|head|i|ii|iii|iv|1|2|3)\b/g;
const roleWords = (t: string) =>
  new Set((t || "").split(/ at | @ | - | \| |,/i)[0].toLowerCase().replace(/[()]/g, " ").replace(SENIORITY, " ").split(/[^a-z0-9+#]+/).filter((w) => w.length > 1));

/** People whose title is the same role as the job (seniority ignored), e.g. "Product Manager" for "Associate Product Manager". */
export function sameRole(jobTitle: string, people: Person[]) {
  const want = roleWords(jobTitle);
  if (!want.size) return [];
  return people.filter((p) => {
    const have = roleWords(p.title);
    const hit = [...want].filter((w) => have.has(w)).length;
    return hit === want.size || (want.size >= 3 && hit / want.size >= 0.67);
  });
}

/** Same-role people's skills, counted, for the resume prompt. Hints only. */
export function sameRoleSummary(peers: Person[]) {
  const counts = new Map<string, { name: string; n: number }>();
  peers.forEach((p) => new Set(p.skills.map((s) => s.trim())).forEach((s) => {
    const k = norm(s);
    if (k) counts.set(k, { name: counts.get(k)?.name || s, n: (counts.get(k)?.n || 0) + 1 });
  }));
  return {
    people: peers.length,
    titles: peers.map((p) => p.title).slice(0, 10),
    skills: [...counts.values()].sort((a, b) => b.n - a.n).slice(0, 20).map(({ name, n }) => ({ skill: name, listed_by: n })),
  };
}

/** True if `term` appears in `text` as a whole word/phrase (case-insensitive). */
export function mentions(text: string, term: string) {
  const t = term.trim().toLowerCase();
  if (!t) return false;
  const esc = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${esc}($|[^a-z0-9])`, "i").test(text.toLowerCase());
}

/** Skills the student said they've used at project level or more, plus what their resume lists. */
export function confirmedSkills(profile: { skills?: { name: string; level: number }[] | null; resume_profile?: ResumeProfile | null }) {
  return [...(profile.skills || []).filter((s) => s.level >= 2).map((s) => s.name), ...(profile.resume_profile?.skills || [])];
}

/** Skills the student said they haven't really used (never asked again, never added). */
export function saidNoSkills(profile: { skills?: { name: string; level: number }[] | null }) {
  return (profile.skills || []).filter((s) => s.level < 2).map((s) => s.name);
}

export function knownSkills(profile: { skills?: { name: string; level: number }[] | null; resume_profile?: ResumeProfile | null }) {
  return [
    ...(profile.skills || []).map((s) => s.name),
    ...(profile.resume_profile?.skills || []),
  ];
}
