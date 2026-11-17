import { ADDS_TO_RESUME } from "./status";

export type DiffLine = { kind: "ctx" | "del" | "add" | "head"; text: string; reworded?: boolean; reason?: string; skills?: boolean };
type ResumePart = { base_lines: string[]; edits: { old: string; new: string; reason: string }[]; skill_questions: { skill: string; why: string }[] };

const isHead = (l: string) => l.startsWith("## ");

/** Index of the line that lists skills (first line after a heading mentioning "skill"). */
function skillsLineIndex(lines: string[]) {
  const h = lines.findIndex((l) => isHead(l) && /skill/i.test(l));
  if (h < 0) return -1;
  const i = lines.findIndex((l, j) => j > h && !isHead(l));
  return i >= 0 && (i === h + 1) ? i : -1;
}

/**
 * Build before/after/unified lines from the saved edits and the student's skill answers.
 * Only skills answered at level 2+ ("Used in a project") are added.
 */
export function buildDiff(r: ResumePart, levels: Record<string, number>) {
  const added = (r.skill_questions || []).map((q) => q.skill).filter((s) => ADDS_TO_RESUME(levels[s.toLowerCase()] ?? -1));
  const edits = new Map((r.edits || []).map((e) => [e.old, e]));
  const si = skillsLineIndex(r.base_lines);
  const left: DiffLine[] = [], right: DiffLine[] = [], unified: DiffLine[] = [], final: string[] = [];
  r.base_lines.forEach((l, i) => {
    if (isHead(l)) {
      const h = { kind: "head" as const, text: l.slice(3) };
      left.push(h); right.push(h); unified.push(h); final.push(l);
      return;
    }
    let next = l;
    let reworded = false, reason: string | undefined;
    const e = edits.get(l);
    if (e) { next = e.new; reworded = true; reason = e.reason; }
    const skillsHere = i === si;
    if (skillsHere && added.length) next = `${added.join(", ")}, ${next}`;
    if (next !== l) {
      left.push({ kind: "del", text: l });
      right.push({ kind: "add", text: next, reworded, reason, skills: skillsHere });
      unified.push({ kind: "del", text: l }, { kind: "add", text: next, reworded, reason, skills: skillsHere });
    } else {
      left.push({ kind: "ctx", text: l });
      right.push({ kind: "ctx", text: l, skills: skillsHere });
      unified.push({ kind: "ctx", text: l, skills: skillsHere });
    }
    final.push(next);
  });
  // No skills section in the resume: add one at the end.
  if (si < 0 && added.length) {
    const h = { kind: "head" as const, text: "Skills" };
    const a = { kind: "add" as const, text: added.join(", "), skills: true };
    right.push(h, a); unified.push(h, a); final.push("## Skills", added.join(", "));
  }
  return { left, right, unified, final, addedSkills: added };
}
