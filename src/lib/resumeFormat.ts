import type { ResumeProfile } from "@/lib/pipeline/types";

/** What prompts/resume-profile.md returns: the resume as structured parts, each text field in markdown (bold only). */
export type StructuredResume = {
  name?: string;
  headline?: string;
  contact?: { email?: string; phone?: string; city?: string; linkedin?: string; github?: string; website?: string };
  summary?: string;
  experience?: { role?: string; org?: string; dates?: string; bullets?: string[] }[];
  projects?: { name?: string; tech?: string; dates?: string; bullets?: string[] }[];
  education?: { degree?: string; school?: string; dates?: string; details?: string[] }[];
  skills?: { label?: string; items?: string[] }[];
  achievements?: string[];
  other?: { title?: string; bullets?: string[] }[];
  headline_short?: string;
  all_skills?: string[];
  missing?: string[];
};

const t = (s?: string | null) => (s || "").replace(/\s*—\s*/g, ", ").replace(/\s+/g, " ").trim();
const bullet = (b?: string) => { const x = t(b).replace(/^[-•*]\s+/, ""); return x ? `- ${x}` : ""; };
const entry = (left: string, dates?: string) => (left ? `### ${left}${t(dates) ? ` | ${t(dates)}` : ""}` : "");
const join = (...p: (string | undefined)[]) => p.map((x) => t(x)).filter(Boolean).join(", ");

/**
 * The resume as lines in our template, always in the same order. Empty parts are left out.
 * # Name · > Headline · @ email · phone · city · LinkedIn · GitHub · website · ## Summary · ## Experience ·
 * ## Projects · ## Education · ## Skills · ## Achievements · other sections.
 */
export function toLines(r: StructuredResume): string[] {
  const out: string[] = [];
  const section = (title: string, body: string[]) => { const b = body.filter(Boolean); if (b.length) out.push(`## ${title}`, ...b); };
  if (t(r.name)) out.push(`# ${t(r.name)}`);
  if (t(r.headline)) out.push(`> ${t(r.headline)}`);
  const c = r.contact || {};
  const contact = [c.email, c.phone, c.city, c.linkedin, c.github, c.website].map((x) => t(x).replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")).filter(Boolean);
  if (contact.length) out.push(`@ ${contact.join(" · ")}`);
  section("Summary", [t(r.summary)]);
  section("Experience", (r.experience || []).flatMap((e) => [entry(join(e.role, e.org), e.dates), ...(e.bullets || []).map(bullet)]));
  section("Projects", (r.projects || []).flatMap((p) => [entry(t(p.name) + (t(p.tech) ? ` (${t(p.tech)})` : ""), p.dates), ...(p.bullets || []).map(bullet)]));
  section("Education", (r.education || []).flatMap((e) => [entry(join(e.degree, e.school), e.dates), ...(e.details || []).map(bullet)]));
  section("Skills", (r.skills || []).map((g) => { const items = (g.items || []).map(t).filter(Boolean).join(", "); return items ? (t(g.label) ? `**${t(g.label).replace(/:$/, "")}:** ${items}` : items) : ""; }));
  section("Achievements", (r.achievements || []).map(bullet));
  (r.other || []).forEach((o) => t(o.title) && section(t(o.title), (o.bullets || []).map(bullet)));
  return out;
}

/** The short profile the rest of the app reuses (ranking, messages, questions). */
export function toProfile(r: StructuredResume): ResumeProfile {
  const years = (d?: string) => (t(d).match(/\d{4}/g) || []);
  return {
    name: t(r.name) || null,
    headline: t(r.headline_short) || t(r.headline).toLowerCase(),
    skills: [...new Set([...(r.all_skills || []), ...(r.skills || []).flatMap((g) => g.items || [])].map(t).filter(Boolean))],
    projects: (r.projects || []).map((p) => ({ title: t(p.name), detail: (p.bullets || []).map((b) => t(b).replace(/\*\*/g, "")).join(" ") })).filter((p) => p.title),
    education: (r.education || []).map((e) => ({ school: t(e.school), what: t(e.degree), from: years(e.dates)[0] || null, to: years(e.dates)[1] || null })).filter((e) => e.school),
    missing: (r.missing || []).map(t).filter(Boolean).slice(0, 5),
  };
}
