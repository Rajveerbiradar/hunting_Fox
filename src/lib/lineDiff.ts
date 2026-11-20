/** Line-by-line difference between two versions of a resume (longest common subsequence). */
export type LineOp = { kind: "same" | "del" | "add"; text: string };

export function lineDiff(a: string[], b: string[]): LineOp[] {
  const n = a.length, m = b.length;
  // Big resumes are ~60 lines; the table stays small.
  const t: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) t[i][j] = a[i].trim() === b[j].trim() ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
  const out: LineOp[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i].trim() === b[j].trim()) { out.push({ kind: "same", text: b[j] }); i++; j++; }
    else if (t[i + 1][j] >= t[i][j + 1]) out.push({ kind: "del", text: a[i++] });
    else out.push({ kind: "add", text: b[j++] });
  }
  while (i < n) out.push({ kind: "del", text: a[i++] });
  while (j < m) out.push({ kind: "add", text: b[j++] });
  return out;
}
