import type { Check, CompanyData, JobData, Person, ResumeProfile } from "./types";

/** Company check with fixed rules. No AI. Missing facts become "unknown", never guesses. */
export function checkCompany(job: JobData, company: CompanyData) {
  const checks: Check[] = [];
  const red: string[] = [];
  const text = `${job.title}\n${job.description}`.toLowerCase();

  if (company.linkedinUrl) checks.push({ group: "The company", text: `Has a LinkedIn company page${company.sizeText ? ` (${company.sizeText})` : ""}`, result: "pass" });
  else checks.push({ group: "The company", text: "No LinkedIn company page found", result: "warn" });

  if (company.website) checks.push({ group: "The company", text: `Website ${company.domain || company.website} is listed`, result: "pass" });
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
      text: job.poster.worksThere === false ? `Posted by ${job.poster.name}, who doesn't list this company` : `Posted by ${job.poster.name}${job.poster.title ? `, ${job.poster.title}` : ""}`,
      result: job.poster.worksThere === false ? "warn" : "pass",
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
export function skillQuestions(job: JobData, people: Person[], known: string[]) {
  const knownSet = new Set(known.map(norm));
  const counts = new Map<string, { name: string; n: number }>();
  people.forEach((p) =>
    new Set(p.skills.map((s) => s.trim())).forEach((s) => {
      const k = norm(s);
      if (!k) return;
      counts.set(k, { name: counts.get(k)?.name || s, n: (counts.get(k)?.n || 0) + 1 });
    })
  );
  const total = people.length;
  const out: { skill: string; why: string; score: number }[] = [];
  counts.forEach((v, k) => {
    if (knownSet.has(k) || v.n < 2) return;
    out.push({ skill: v.name, why: `${v.n} of the ${total} people on this team list it.`, score: v.n + (job.keySkills.some((s) => norm(s) === k) ? 2 : 0) });
  });
  job.keySkills.forEach((s) => {
    const k = norm(s);
    if (!k || knownSet.has(k) || counts.has(k)) return;
    out.push({ skill: s, why: "The job post asks for it.", score: 1.5 });
  });
  return out.sort((a, b) => b.score - a.score).slice(0, 3).map(({ skill, why }) => ({ skill, why }));
}

/** Team summary passed to the resume-changes prompt. */
export function teamSummary(people: Person[]) {
  const counts = new Map<string, number>();
  people.forEach((p) => p.skills.forEach((s) => counts.set(s, (counts.get(s) || 0) + 1)));
  return {
    people_found: people.length,
    titles: people.map((p) => p.title),
    skill_counts: [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([skill, n]) => ({ skill, n })),
  };
}

/** The fixed message template. AI only supplies `line` when there's a real connection. */
export function buildMessages(
  p: Person,
  ctx: { role: string; company: string; big: boolean; studentName: string; headline?: string; resumeLink: string; portfolio?: string }
) {
  const first = p.first;
  const opener = ctx.big ? `I'm about to apply for the ${ctx.role} role at ${ctx.company}.` : `I just applied for the ${ctx.role} role at ${ctx.company}.`;
  const ask = ctx.big ? "Would you be open to referring me?" : "Could you pass my resume to whoever is hiring?";
  const parts = [`Hi ${first},`, opener, p.line, ask, ctx.resumeLink].filter(Boolean) as string[];
  let note = parts.join(" ");
  if (note.length > 200) note = [`Hi ${first},`, opener, ask, ctx.resumeLink].join(" ");
  if (note.length > 200) note = [`Hi ${first},`, ctx.big ? `I'm applying to ${ctx.company}.` : `I applied to ${ctx.company}.`, ask, ctx.resumeLink].join(" ");

  const cap = (s?: string) => (s ? s[0].toUpperCase() + s.slice(1) : "");
  const subject = ctx.headline ? `${ctx.role} at ${ctx.company}: ${cap(ctx.headline)}` : `Application for ${ctx.role} at ${ctx.company}`;
  const body = [
    `Hi ${first},`,
    "",
    [opener, p.line, ctx.headline ? `I'm a ${ctx.headline}.` : ""].filter(Boolean).join(" "),
    "",
    `${ask} My resume is attached${ctx.portfolio ? `, and my work is at ${ctx.portfolio}` : ""}.`,
    "",
    "Thank you,",
    ctx.studentName,
  ].join("\n");
  return { note, subject, body };
}

export function knownSkills(profile: { skills?: { name: string; level: number }[] | null; resume_profile?: ResumeProfile | null }) {
  return [
    ...(profile.skills || []).map((s) => s.name),
    ...(profile.resume_profile?.skills || []),
  ];
}
