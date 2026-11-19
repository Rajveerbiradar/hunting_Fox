/* eslint-disable @typescript-eslint/no-explicit-any */
import { writerBuilt, type BuildOpts, type Provider } from "@/lib/ai";
import { jlog } from "@/lib/joblog";
import { confirmedSkills, mentions, saidNoSkills, skillQuestions } from "./rules";
import type { CompanyData, JobData, ResumePart } from "./types";

/** The company as both prompts see it: who they are and what they say they believe. */
export const companyInput = (c?: Partial<CompanyData> | null, name?: string) => ({
  name: c?.name || name || "",
  about: c?.about || null,
  tagline: c?.tagline || null,
  specialties: c?.specialties || [],
  industry: c?.industry || null,
  size: c?.sizeText || null,
  founded: c?.founded || null,
});

/** A true fact the student told us in their own words, answering a gap question. Saved on profiles.facts. */
export type Fact = { q: string; a: string; at?: string };

type Out = {
  company_brief?: { believes?: string; building?: string; deliver?: string };
  priorities?: { need: string; proof: string; strength?: string }[];
  perfect_match?: boolean;
  summary?: string; summary_reason?: string;
  edits?: { old: string; new: string; reason: string }[];
  /** v6 prompt: the whole page after the rewrite, same length and order as the input, plus a reason per changed line. */
  lines?: string[];
  reasons?: Record<string, string>;
  gaps?: { question: string; why: string }[];
  ask?: { skill: string; why: string }[];
};

/**
 * Tailor the student's resume to one job (prompts/resume-changes.md): recruiter-style priorities, real rewrites
 * in the job's language, gap questions for what the resume doesn't show. Returns SUGGESTIONS only
 * (v: 2, applied: false): nothing reaches Final or the PDF until the student taps "Apply changes".
 */
export async function makeResume(lines: string[], profile: any, jd: JobData, own?: Provider | null, company?: Partial<CompanyData> | null, opts?: BuildOpts & { onRaw?: (out: unknown) => void }): Promise<ResumePart | null> {
  if (!lines.length) return null;
  const confirmed = confirmedSkills(profile || {});
  const saidNo = saidNoSkills(profile || {});
  const facts: Fact[] = Array.isArray(profile?.facts) ? profile.facts : [];
  const input = {
    resume_lines: lines,
    student_facts: facts.map((f) => `${f.q} → ${f.a}`),
    confirmed_skills: confirmed,
    said_no: saidNo,
    job: { title: jd.title, key_skills: jd.keySkills, description: jd.description.slice(0, 7000) },
    company: companyInput(company, jd.company),
  };
  // One call: ai.ts already retries a busy provider and moves on to the next one. Repeating a cut-off or
  // unreadable reply here only made the student wait minutes for the same failure.
  let failed = "";
  const t0 = Date.now();
  let out: Out | null = await writerBuilt<Out>("resume-changes", input, own, opts).catch(async (e) => {
    failed = e?.budget ? "budget" : String(e?.message || e).slice(0, 200);
    return null;
  });
  opts?.onRaw?.(out);
  // A full-page answer (prompt v6+): every line comes back, so no line can be skipped. Turn it into edits.
  if (out && Array.isArray(out.lines)) {
    if (out.lines.length === lines.length) {
      const fixed = (l: string) => /^(# |@ |## )/.test(l);
      const sumHead = lines.findIndex((l) => /^## (professional )?(summary|profile|about( me)?|objective|career objective)\b/i.test(l));
      let sumEnd = sumHead;
      if (sumHead >= 0) while (sumEnd + 1 < lines.length && !lines[sumEnd + 1].startsWith("## ")) sumEnd++;
      out.edits = out.lines.flatMap((n, i) => {
        const o = lines[i];
        const nn = String(n ?? "").replace(/\s+/g, " ").trim();
        if (!nn || nn === o.trim() || fixed(o) || (sumHead >= 0 && i > sumHead && i <= sumEnd)) return [];
        return [{ old: o, new: nn, reason: out!.reasons?.[String(i)] || "Written for this job" }];
      });
    } else {
      await jlog("warn", "resume", `The AI returned ${out.lines.length} lines for a ${lines.length}-line resume, so the page couldn't be lined up`);
    }
  }
  if (out && !(out.edits?.length || out.priorities?.length || out.summary)) { failed = "The AI sent back an empty answer"; out = null; }
  await jlog(out ? "info" : "warn", "resume", `Resume changes ${out ? "written" : "failed"} in ${Math.round((Date.now() - t0) / 1000)}s${failed ? `: ${failed}` : ""}`);
  if (!out) {
    // Never pretend the resume already fits: say it failed so the student can try again.
    await jlog("error", "resume", `Resume changes failed: ${failed}`);
    return { v: 2, applied: false, decisions: {}, base_lines: lines, edits: [], skill_questions: [], suggestions: [], priorities: [], gaps: [], failed: failed || "unknown" };
  }

  // The AI sometimes drops a marker, a ** or a space when it copies a line: match on the plain words instead.
  const plain = (l: string) => l.replace(/^(#{1,3} |[-•] |@ |> )/, "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  const byPlain = new Map(lines.map((l) => [plain(l), l] as const));
  const exact = (o: string) => (lines.includes(o) ? o : byPlain.get(plain(o)) || "");

  // What counts as "the student has it": resume text, confirmed skills, and their own answers.
  const known = [lines.join("\n"), ...facts.map((f) => f.a)].join("\n");
  const have = (t: string) => mentions(known, t) || confirmed.some((c) => c.trim().toLowerCase() === t.trim().toLowerCase());
  const no = new Set(saidNo.map((x) => x.trim().toLowerCase()));
  // Tools the job names or we're asking about. An edit that brings one in without the student's yes is dropped.
  const vocab = [...new Set([...jd.keySkills, ...(out?.ask || []).map((q) => q.skill)].map((x) => String(x || "").trim()).filter((x) => x.length > 1))];
  const clean = (s: string) => s.replace(/\s*—\s*/g, ", ").replace(/\s+/g, " ").trim();
  const edits = (out?.edits || []).map((e) => ({ ...e, old: e?.old ? exact(e.old) : "" })).filter((e) => {
    if (!e?.old || !e?.new || clean(e.new) === e.old) return false;
    const sneaked = vocab.find((t) => mentions(e.new, t) && !mentions(e.old, t) && !have(t));
    if (sneaked) { void jlog("info", "resume", `Dropped an edit that added "${sneaked}" without asking`); return false; }
    return true;
  }).map((e): { old: string; new: string; reason: string; group?: string } => ({ old: e.old, new: clean(e.new), reason: e.reason || "Written for this job" })).slice(0, 40);

  // The summary, written for this job: replaces the resume's summary lines, or is added after the contact line.
  let summary_insert: ResumePart["summary_insert"];
  const sum = clean(out?.summary || "");
  const sneakedSum = sum && vocab.find((t) => mentions(sum, t) && !have(t));
  if (sneakedSum) void jlog("info", "resume", `Dropped the new summary: it added "${sneakedSum}" without asking`);
  if (sum && sum.split(" ").length >= 20 && !sneakedSum) {
    const reason = out?.summary_reason || "Written for this job from what's already on your resume";
    const h = lines.findIndex((l) => /^## (professional )?(summary|profile|about( me)?|objective|career objective)\b/i.test(l));
    const mine: string[] = [];
    if (h >= 0) for (let i = h + 1; i < lines.length && !lines[i].startsWith("## "); i++) mine.push(lines[i]);
    if (mine.length) {
      const rest = edits.filter((e) => !mine.includes(e.old));
      edits.length = 0;
      // One decision for the whole summary: the folded lines go (or stay) with it.
      edits.push({ old: mine[0], new: sum, reason, group: "s" }, ...mine.slice(1).map((o) => ({ old: o, new: "", reason: "Folded into the new summary", group: "s" })), ...rest);
    } else summary_insert = { text: sum, reason };
  }

  const asked = new Set<string>();
  const skill_questions = (out ? out.ask || [] : skillQuestions(jd, confirmed, saidNo))
    .filter((q) => q?.skill && !have(q.skill) && !no.has(q.skill.trim().toLowerCase()))
    .filter((q) => { const k = q.skill.trim().toLowerCase(); if (asked.has(k)) return false; asked.add(k); return true; })
    .slice(0, 5)
    .map((q) => ({ skill: q.skill.trim(), why: q.why || "The job post asks for it." }));

  const answered = new Set(facts.map((f) => f.q.trim().toLowerCase()));
  const gaps = (out?.gaps || []).filter((g) => g?.question && !answered.has(g.question.trim().toLowerCase())).slice(0, 4)
    .map((g, i) => ({ id: `g${i}`, question: clean(g.question), why: clean(g.why || "") }));

  await jlog("info", "resume", `${edits.length} suggested edits${summary_insert ? " + new summary" : ""}, ${gaps.length} gap questions, ${skill_questions.length} tool questions${out?.perfect_match ? " (AI says it already matches)" : ""}`);
  return {
    v: 2, applied: false, decisions: {},
    base_lines: lines, edits, skill_questions, suggestions: [],
    priorities: (out?.priorities || []).slice(0, 5).map((p) => ({ need: clean(p.need), proof: clean(p.proof || ""), strength: (["strong", "weak", "none"].includes(String(p.strength)) ? p.strength : "weak") as "strong" | "weak" | "none" })),
    gaps, summary_insert,
    company_brief: out.company_brief?.believes || out.company_brief?.deliver ? { believes: clean(out.company_brief.believes || ""), building: clean(out.company_brief.building || ""), deliver: clean(out.company_brief.deliver || "") } : undefined,
  };
}
