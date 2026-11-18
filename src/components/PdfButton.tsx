"use client";
import { useState, type ReactNode } from "react";
import { Spinner } from "./ui";

/** "Rajveer Biradar - Resume - Sure.pdf" */
function fileName(name: string, company?: string) {
  const base = `${name || "Resume"} - Resume${company ? ` - ${company}` : ""}`;
  return base.replace(/[^\w .()&-]/g, "").replace(/\s+/g, " ").trim().slice(0, 90) + ".pdf";
}

/**
 * Makes the resume PDF in the browser and saves it. Pass `lines` when the page already has them
 * (the resume page, so the student's latest answers are in it); otherwise it asks `source` for them.
 */
export function PdfButton({ lines, name, company, source, className, style, children }: {
  lines?: string[]; name?: string; company?: string; source?: string; className?: string; style?: React.CSSProperties; children: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function go() {
    setBusy(true); setErr("");
    try {
      let l = lines, n = name, c = company;
      if (!l && source) {
        const d = await fetch(source, { cache: "no-store" }).then((r) => r.json());
        l = d.lines; n = n || d.name; c = c || d.company;
      }
      if (!l?.length) throw new Error("Add your resume first.");
      n = n || (l[0] || "").replace(/^#\s*/, "");
      const { resumePdf } = await import("@/lib/resumePdf");
      const file = fileName(n || "", c);
      const blob = await resumePdf(l, file.replace(/\.pdf$/, ""));
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = file;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      setErr((e as Error)?.message?.includes("resume") ? (e as Error).message : "Couldn't make the PDF. Try again.");
    }
    setBusy(false);
  }
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 4 }}>
      <button type="button" className={className} style={style} onClick={go} disabled={busy} aria-busy={busy}>
        {busy ? <><Spinner size={16} />Making your PDF…</> : children}
      </button>
      {err && <span role="alert" style={{ fontSize: 14, color: "#B8132F", fontWeight: 600 }}>{err}</span>}
    </span>
  );
}
