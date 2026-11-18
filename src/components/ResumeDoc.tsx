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

export type DocMark = { old?: string; reason?: string; skills?: boolean; extra?: ReactNode };

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
          <div key={i} className="rmark">
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
