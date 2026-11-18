import type { ReactNode } from "react";

// Hunting Fox's own resume template. Every resume (preview, shared link, PDF) is drawn here,
// from plain lines in this format:
//   # Name                     (first line; an old resume without "# " still uses its first line)
//   > Headline                 (one line under the name)
//   @ email · phone · link      (contact line)
//   ## Section                 (Experience, Projects, Education, Skills…)
//   ### Title, Place | Dates   (an entry; the part after " | " sits on the right)
//   - Bullet
//   Anything else is a plain paragraph. **bold** works inside any line.

export type DocMark = { old?: string; reason?: string; skills?: boolean; extra?: ReactNode; off?: boolean };

/** **bold** → <b>. Nothing else is parsed, so text stays exactly as written. */
function inline(t: string) {
  const parts = t.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => (p.startsWith("**") && p.endsWith("**") && p.length > 4 ? <b key={i}>{p.slice(2, -2)}</b> : p));
}

const kind = (l: string, i: number) =>
  l.startsWith("# ") || (i === 0 && !l.startsWith("## ")) ? "name"
  : l.startsWith("> ") ? "headline"
  : l.startsWith("@ ") ? "contact"
  : l.startsWith("## ") ? "section"
  : l.startsWith("### ") ? "entry"
  : /^[-•]\s/.test(l) ? "bullet"
  : "text";

/** Strip the template marker, for copying a line into the student's own resume. */
export const plainLine = (l: string) => l.replace(/^(#{1,3} |@ |> |[-•] )/, "").replace(/\*\*/g, "");

/**
 * The resume, drawn in our template. `marks` (by line index) highlights changed lines:
 * green background, the old line struck through underneath, and why.
 */
/** One resume line drawn in the template. `i` is its index (line 0 is the name). */
function lineEl(raw: string, i: number): ReactNode {
  const l = raw.trim();
  if (!l) return null;
  const k = kind(l, i);
  if (k === "name") return <h1>{inline(l.replace(/^#\s*/, ""))}</h1>;
  if (k === "headline") return <p className="rh">{inline(l.slice(2))}</p>;
  if (k === "contact") return <p className="rc">{inline(l.slice(2))}</p>;
  if (k === "section") return <h2>{l.slice(3)}</h2>;
  if (k === "entry") {
    const [left, right] = l.slice(4).split(" | ");
    const tech = left.match(/^(.*?) (\(.+\))$/);
    return <div className="re"><span className="rl"><b>{inline(tech ? tech[1] : left)}</b>{tech && <i> {tech[2]}</i>}</span>{right && <span>{right}</span>}</div>;
  }
  if (k === "bullet") return <p className="rb">{inline(l.replace(/^[-•]\s*/, ""))}</p>;
  return <p>{inline(l)}</p>;
}

export type CompareRow = { left: string; right: string; changed: boolean; mark?: DocMark };

/**
 * Before and after, side by side, row by row: the resume as it is on the left, this job's version on the
 * right. Changed rows are lined up, red on the left and green on the right. On a phone the two stack.
 */
export function CompareDoc({ rows, leftTitle, rightTitle, onCopy }: { rows: CompareRow[]; leftTitle: string; rightTitle: string; onCopy?: (t: string) => void }) {
  return (
    <article className="rdoc rcmp">
      <div className="rcrow rchead"><div>{leftTitle}</div><div>{rightTitle}</div></div>
      {rows.map((r, i) => {
        if (!r.left.trim() && !r.right.trim()) return null;
        if (!r.changed) return <div key={i} className="rcrow"><div>{lineEl(r.left, i)}</div><div>{lineEl(r.right, i)}</div></div>;
        const m = r.mark;
        return (
          <div key={i} className="rcrow ch">
            <div><div className="rcold">{r.left.trim() ? lineEl(r.left, i) : <p className="rnone">Not on your resume</p>}</div></div>
            <div>
              {/* Only the resume line sits in the green box; why we changed it and Keep / Drop sit under it. */}
              <div className={m?.off ? "rcnew off" : "rcnew"}>
                {r.right.trim() ? lineEl(r.right, i) : <p className="rnone">Removed (folded into the new summary)</p>}
                {onCopy && r.right.trim() && <button className="cbtn noprint" onClick={() => onCopy(plainLine(r.right.trim()))}>Copy</button>}
              </div>
              {(m?.reason || m?.extra) && (
                <div className="rcwhy noprint">
                  {m?.reason && <p><span>Why:</span> {m.reason}</p>}
                  {m?.extra}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </article>
  );
}

export function ResumeDoc({ lines, marks, onCopy }: { lines: string[]; marks?: Record<number, DocMark>; onCopy?: (t: string) => void }) {
  return (
    <article className="rdoc">
      {lines.map((raw, i) => {
        const l = raw.trim();
        if (!l) return null;
        const k = kind(l, i);
        const m = marks?.[i];
        let el: ReactNode;
        if (k === "name") el = <h1>{inline(l.replace(/^#\s*/, ""))}</h1>;
        else if (k === "headline") el = <p className="rh">{inline(l.slice(2))}</p>;
        else if (k === "contact") el = <p className="rc">{inline(l.slice(2))}</p>;
        else if (k === "section") el = <h2>{l.slice(3)}</h2>;
        else if (k === "entry") {
          const [left, right] = l.slice(4).split(" | ");
          const tech = left.match(/^(.*?) (\(.+\))$/);
          el = <div className="re"><span className="rl"><b>{inline(tech ? tech[1] : left)}</b>{tech && <i> {tech[2]}</i>}</span>{right && <span>{right}</span>}</div>;
        } else if (k === "bullet") el = <p className="rb">{inline(l.replace(/^[-•]\s*/, ""))}</p>;
        else el = <p>{inline(l)}</p>;
        if (!m) return <div key={i}>{el}</div>;
        return (
          <div key={i} className={m.off ? "rmark off" : "rmark"}>
            {el}
            {m.old && <p className="rold">{plainLine(m.old)}</p>}
            {m.reason && <p className="rwhy">{m.reason}</p>}
            {m.extra}
            {onCopy && <button className="cbtn noprint" onClick={() => onCopy(plainLine(l))}>Copy</button>}
          </div>
        );
      })}
    </article>
  );
}
