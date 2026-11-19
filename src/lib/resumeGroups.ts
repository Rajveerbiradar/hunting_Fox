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
