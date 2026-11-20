/**
 * The resume split into the parts a student checks one by one on the resume setup page:
 * the top (name, headline, contact), the summary, every entry (a `### …` line and its bullets),
 * and every section that has no entries (Skills, Achievements…).
 * Section titles (`## …`) that only hold entries aren't a part of their own.
 */
export type ResumeGroup = {
  /** Stable while the part's first line stays the same: "top", or the first line itself. */
  key: string;
  /** What the student sees as the part's name. */
  title: string;
  /** The section it sits in ("Experience", "Projects"…), empty for the top. */
  section: string;
  kind: "top" | "text" | "entry";
  start: number;
  /** One past the last line. */
  end: number;
  lines: string[];
};

const clean = (s: string) => s.replace(/\*\*/g, "").trim();

export function groupLines(lines: string[]): ResumeGroup[] {
  const out: ResumeGroup[] = [];
  let section = "";
  let cur: ResumeGroup | null = null;
  const close = (end: number) => { if (cur) { cur.end = end; cur.lines = lines.slice(cur.start, end); if (cur.lines.some((l) => l.trim())) out.push(cur); cur = null; } };

  lines.forEach((raw, i) => {
    const l = raw.trim();
    if (l.startsWith("## ")) {
      close(i);
      section = clean(l.slice(3));
      // Lines straight under the section title (before any entry) form the section's own part.
      cur = { key: l, title: section, section, kind: "text", start: i + 1, end: i + 1, lines: [] };
      return;
    }
    if (l.startsWith("### ")) {
      close(i);
      const left = clean(l.slice(4).split(" | ")[0]);
      cur = { key: l, title: left, section, kind: "entry", start: i, end: i, lines: [] };
      return;
    }
    if (i === 0 || (!cur && !section)) {
      if (!cur) cur = { key: "top", title: "Name, headline and contact", section: "", kind: "top", start: i, end: i, lines: [] };
    }
  });
  close(lines.length);

  // Two parts can share a first line (two identical entry titles): keep keys unique.
  const seen = new Map<string, number>();
  for (const g of out) {
    const n = seen.get(g.key) || 0;
    seen.set(g.key, n + 1);
    if (n) g.key = `${g.key}#${n + 1}`;
  }
  return out;
}

/** The same lines, ignoring spaces at the ends: used to check a part hasn't changed since the page loaded. */
export const sameLines = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x.trim() === (b[i] || "").trim());

/** The resume with one part swapped for new lines. */
export function replaceGroup(lines: string[], g: ResumeGroup, next: string[]): string[] {
  return [...lines.slice(0, g.start), ...next, ...lines.slice(g.end)];
}

/** The usual order of sections on a resume; a new section goes before the first existing one that comes later. */
export const SECTION_ORDER = ["Summary", "Experience", "Projects", "Education", "Skills", "Achievements"];
/** Sections every resume should have: the setup page always shows a place to add these. */
export const MANDATORY = ["Summary", "Experience", "Projects", "Education", "Skills"];

const sectionName = (l: string) => l.trim().slice(3).replace(/\*\*/g, "").trim().toLowerCase();

/** Put new lines at the end of a section, creating the section (in the usual order) when it isn't there. */
export function insertInSection(lines: string[], section: string, added: string[]): string[] {
  const want = section.toLowerCase();
  const at = lines.findIndex((l) => l.trim().startsWith("## ") && (sectionName(l) === want || sectionName(l).includes(want)));
  if (at >= 0) {
    let end = lines.findIndex((l, i) => i > at && l.trim().startsWith("## "));
    if (end < 0) end = lines.length;
    return [...lines.slice(0, end), ...added, ...lines.slice(end)];
  }
  const rank = (name: string) => { const i = SECTION_ORDER.findIndex((x) => x.toLowerCase() === name); return i < 0 ? 99 : i; };
  const mine = rank(want);
  const before = lines.findIndex((l) => l.trim().startsWith("## ") && rank(sectionName(l)) > mine);
  const block = [`## ${section}`, ...added];
  return before < 0 ? [...lines, ...block] : [...lines.slice(0, before), ...block, ...lines.slice(before)];
}

/** Mandatory sections this resume doesn't have yet (by its `## ` titles). */
export function missingSections(lines: string[]): string[] {
  const names = lines.filter((l) => l.trim().startsWith("## ")).map(sectionName);
  return MANDATORY.filter((m) => !names.some((n) => n.includes(m.toLowerCase())));
}
