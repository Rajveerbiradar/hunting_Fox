/**
 * Which skills of the people we found are worth showing a student for THIS job.
 *
 * A raw count across everyone is wrong: at a small startup the closest people can be a CA founder and a sales lead,
 * and their skills (Taxation, Audit) mean nothing to someone applying as a developer. So a skill only counts when:
 *  1. the job post itself names it (title, key skills or description), or
 *  2. it comes from someone whose role is like the job's role (same work family, e.g. developer ≈ engineer ≈ SDE).
 * Everything else is left out. Pure code, no AI: it runs on the page.
 */
import type { JobData, Person } from "./pipeline/types";

// Work families: words in a title that mean the same kind of work.
const FAMILIES: [string, string[]][] = [
  ["dev", ["developer", "engineer", "engineering", "programmer", "sde", "software", "backend", "frontend", "fullstack", "full-stack", "android", "ios", "mobile", "devops", "web", "tech", "technical", "cto"]],
  ["design", ["designer", "design", "ux", "ui", "product designer", "visual", "graphic", "creative"]],
  ["data", ["data", "analyst", "analytics", "scientist", "ml", "machine learning", "ai"]],
  ["product", ["product", "pm", "cpo"]],
  ["marketing", ["marketing", "growth", "brand", "content", "seo", "social media", "community", "cmo", "communications", "pr"]],
  ["sales", ["sales", "business development", "bd", "bdr", "sdr", "account executive", "account manager", "partnerships", "revenue", "gtm", "go-to-market"]],
  ["finance", ["finance", "financial", "accountant", "accounting", "ca", "chartered", "tax", "audit", "cfo", "treasury"]],
  ["legal", ["legal", "lawyer", "advocate", "counsel", "compliance", "law"]],
  ["people", ["hr", "human resources", "talent", "recruiter", "recruiting", "people", "chro"]],
  ["ops", ["operations", "ops", "coo", "supply chain", "logistics", "procurement"]],
  // Founder's Office is a role next to the founders, not the founders themselves: a CA founder's Taxation is not
  // something an FO candidate should copy. So the two are separate families.
  ["fo", ["founder's office", "founders office", "founder office", "chief of staff", "strategy", "business operations", "associate to the founder", "associate to founder"]],
  ["founder", ["founder", "co-founder", "cofounder", "ceo", "chief executive"]],
];

const low = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9+#.\s'-]/g, " ").replace(/\s+/g, " ")} `;

/** The work families a title belongs to. */
export function families(title: string): Set<string> {
  const t = low(title);
  const out = new Set<string>();
  for (const [id, words] of FAMILIES) if (words.some((w) => t.includes(` ${w} `) || t.includes(` ${w}s `))) out.add(id);
  if (out.has("fo")) out.delete("founder"); // "Founder's Office" mentions the word founder but isn't one
  return out;
}

/** Does this text mention the skill as a whole word or phrase? */
const mentions = (text: string, skill: string) => {
  const s = skill.toLowerCase().trim();
  if (s.length < 2) return false;
  const esc = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`, "i").test(text);
};

export type SkillPick = { name: string; n: number; inPost: boolean };

export function relevantSkills(people: Person[], job: Partial<JobData> | null | undefined) {
  const post = [job?.title || "", ...(job?.keySkills || []), job?.description || ""].join("\n").toLowerCase();
  const jobFam = families(job?.title || "");
  // "Founder's Office" type jobs work next to founders, so founders count as the same role.
  const similar = (p: Person) => {
    if (!jobFam.size) return false;
    const f = families(`${p.title || ""} ${p.headline || ""}`);
    for (const x of f) if (jobFam.has(x)) return true;
    return false;
  };
  const relevantPeople = new Set(people.filter(similar).map((p) => p.id));
  const m = new Map<string, SkillPick>();
  for (const p of people) {
    const near = relevantPeople.has(p.id);
    for (const raw of new Set((p.skills || []).map((k) => k.trim()).filter(Boolean))) {
      const inPost = mentions(post, raw);
      if (!inPost && !near) continue; // someone in another kind of role, and the post doesn't ask for it
      const k = raw.toLowerCase();
      const e = m.get(k);
      if (e) e.n++; else m.set(k, { name: raw, n: 1, inPost });
    }
  }
  // Skills the job post names first, then the most common among people in a similar role.
  const skills = [...m.values()].sort((a, b) => Number(b.inPost) - Number(a.inPost) || b.n - a.n).slice(0, 16);
  return { skills, relevantPeople, inPost: (s: string) => mentions(post, s) };
}
