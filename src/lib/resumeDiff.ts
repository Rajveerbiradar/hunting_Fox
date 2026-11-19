import { ADDS_TO_RESUME } from "./status";

/** `key` = which suggestion this line belongs to (edit index, its group, or "s" for an inserted summary). */
export type DiffLine = { kind: "ctx" | "del" | "add" | "head"; text: string; reworded?: boolean; reason?: string; skills?: boolean; key?: string };
type ResumePart = { base_lines: string[]; edits: { old: string; new: string; reason: string; group?: string }[]; skill_questions: { skill: string; why: string }[]; summary_insert?: { text: string; reason: string }; v?: number; applied?: boolean; decisions?: Record<string, boolean> };

/** The id a keep/drop decision is stored under. */
export const editKey = (e: { group?: string }, i: number) => e.group || String(i);

/**
 * Which suggestions reach Final and the PDF. v2 resumes: only after "Apply changes", and only the kept ones.
 * Older resumes (made before the review step) keep every change, as they always did.
 */
export function appliedUse(r: ResumePart): (key: string) => boolean {
  if (r.v !== 2) return () => true;
  if (!r.applied) return () => false;
  return (k) => r.decisions?.[k] !== false;
}

const isHead = (l: string) => l.startsWith("## ");

/**
 * The skills line that answered skills go into. A resume can have several ("Android: …", "Tools: …"), so
 * pick the general one (Tools / Software / Other / General) and only fall back to the last line of the section.
 * Putting "PowerPoint" under "Android:" read as keyword stuffing.
 */
function skillsLineIndex(lines: string[]) {
  const h = lines.findIndex((l) => isHead(l) && /skill/i.test(l));
  if (h < 0) return -1;
  let end = lines.findIndex((l, j) => j > h && isHead(l));
  if (end < 0) end = lines.length;
  const rows = lines.map((l, j) => ({ l, j })).filter((x) => x.j > h && x.j < end && x.l.trim());
  if (!rows.length) return -1;
  const general = rows.find((x) => /^([-•] )?(\*\*)?(tools?|software|other|general|others)\b/i.test(x.l.trim()));
  return (general || rows[rows.length - 1]).j;
}

/**
 * Build before/after/unified lines from the saved edits and the student's skill answers.
 * Only skills answered at level 2+ ("Used in a project") are added.
 */
export function buildDiff(r: ResumePart, levels: Record<string, number>, use: (key: string) => boolean = () => true) {
  const added = (r.skill_questions || []).map((q) => q.skill).filter((s) => ADDS_TO_RESUME(levels[s.toLowerCase()] ?? -1));
  const edits = new Map((r.edits || []).map((e, i) => [e.old, { ...e, key: editKey(e, i) }] as const).filter(([, e]) => use(e.key)));
  const si = skillsLineIndex(r.base_lines);
  const contact = r.base_lines.findIndex((l) => l.startsWith("@ "));
  const insertAfter = contact >= 0 && contact < 4 ? contact : 0;
  const left: DiffLine[] = [], right: DiffLine[] = [], unified: DiffLine[] = [], final: string[] = [];
  r.base_lines.forEach((l, i) => {
    if (isHead(l)) {
      const h = { kind: "head" as const, text: l.slice(3) };
      left.push(h); right.push(h); unified.push(h); final.push(l);
      return;
    }
    let next = l;
    let reworded = false, reason: string | undefined, key: string | undefined;
    const e = edits.get(l);
    if (e) {
      next = e.new;
      // Keep the template marker of the old line ("- ", "### ") if the AI dropped it.
      const marker = l.match(/^(### |- |• |@ |> |# )/)?.[0];
      if (marker && !next.startsWith(marker)) next = marker + next.replace(/^(#{1,3} |[-•] |@ |> )/, "");
      reworded = true; reason = e.reason; key = e.key;
    }
    const skillsHere = i === si;
    if (skillsHere && added.length) {
      // "- Tools: Figma, Excel" → "- Tools: Figma, Excel, Photoshop": new skills go at the end of the general line.
      next = `${next.replace(/[,.\s]+$/, "")}, ${added.join(", ")}`;
    }
    if (e && next.replace(/^(#{1,3} |[-•] |@ |> )/, "") === "") {
      // Line folded into the new summary: removed. Placeholders keep left/right/final on the same index.
      left.push({ kind: "del", text: l }); right.push({ kind: "ctx", text: "" }); unified.push({ kind: "del", text: l }); final.push("");
      return;
    }
    if (next !== l) {
      left.push({ kind: "del", text: l });
      right.push({ kind: "add", text: next, reworded, reason, skills: skillsHere, key });
      unified.push({ kind: "del", text: l }, { kind: "add", text: next, reworded, reason, skills: skillsHere, key });
    } else {
      left.push({ kind: "ctx", text: l });
      right.push({ kind: "ctx", text: l, skills: skillsHere });
      unified.push({ kind: "ctx", text: l, skills: skillsHere });
    }
    final.push(next);
    // No summary section: the job's summary goes right after the contact line (or the name).
    if (r.summary_insert && i === insertAfter && use("s")) {
      const h = { kind: "head" as const, text: "Summary" };
      const a = { kind: "add" as const, text: r.summary_insert.text, reworded: false, reason: r.summary_insert.reason, key: "s" };
      left.push({ kind: "ctx", text: "" }, { kind: "ctx", text: "" }); right.push(h, a); unified.push(h, a); final.push("## Summary", r.summary_insert.text);
    }
  });
  // No skills section in the resume: add one at the end.
  if (si < 0 && added.length) {
    const h = { kind: "head" as const, text: "Skills" };
    const a = { kind: "add" as const, text: added.join(", "), skills: true };
    right.push(h, a); unified.push(h, a); final.push("## Skills", added.join(", "));
  }
  return { left, right, unified, final, addedSkills: added };
}

/** The resume as it goes into Final and the PDF: applied suggestions only (plus confirmed skills). */
export function finalLines(r: ResumePart, levels: Record<string, number>) {
  return buildDiff(r, levels, appliedUse(r)).final.filter((l) => l.trim());
}

/**
 * True when this job's resume really differs from the main resume it started from (changes applied, or
 * skills answered). A failed or never-applied rewrite is not personalised: use the student's current main resume.
 */
export function isPersonalised(r: ResumePart | null | undefined, levels: Record<string, number>) {
  if (!r || (r as { failed?: unknown }).failed || !Array.isArray(r.base_lines)) return false;
  try {
    const norm = (a: string[]) => a.map((l) => l.trim()).filter(Boolean).join("\n");
    return norm(finalLines(r, levels)) !== norm(r.base_lines);
  } catch { return false; }
}
