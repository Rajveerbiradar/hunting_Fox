"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Icon, Spinner } from "./ui";

/** Upload → "Did we read your resume correctly?" → confirm. Used on Home, Account and the resume page. */
export function ResumeUpload({ signedIn, compact, current, onDone }: { signedIn: boolean; compact?: boolean; current?: string; onDone?: () => void }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "reading" | "check" | "error">("idle");
  const [lines, setLines] = useState<string[]>([]);
  const [file, setFile] = useState("");
  const [err, setErr] = useState("");

  function pick() {
    if (!signedIn) return router.push("/sign-in");
    input.current?.click();
  }

  async function upload(f: File) {
    setFile(f.name);
    setState("reading");
    const fd = new FormData();
    fd.append("file", f);
    const r = await fetch("/api/resume", { method: "POST", body: fd });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      setErr(d.error === "unreadable" ? "We couldn't read any text in that file. If it's a scanned image, export it again as a PDF with text." : d.error === "too_big" ? "That file is over 5 MB. Try a smaller PDF." : "Something went wrong reading it. Try again.");
      return setState("error");
    }
    setLines(d.lines || []);
    setState("check");
  }

  async function confirm(ok: boolean) {
    await fetch("/api/resume", { method: ok ? "PUT" : "DELETE" });
    setState("idle");
    onDone?.();
    router.refresh();
  }

  return (
    <div className="card" style={{ marginTop: compact ? 20 : 12 }}>
      <input ref={input} type="file" accept=".pdf,.md,.txt" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      {state === "idle" || state === "error" ? (
        <div className="row" style={{ padding: "16px 16px 16px 18px" }}>
          <span className="tile" style={{ background: current ? "var(--green-bg)" : "#FDE8EE", color: current ? "var(--green)" : "var(--pink)" }}>{Icon.doc()}</span>
          <div style={{ flex: "1 1 220px", minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 17, fontWeight: 700 }}>{current || "Add your resume"}</span>
            <span className="mute" style={{ fontSize: 14, lineHeight: 1.45 }}>
              {state === "error" ? <span style={{ color: "var(--red)", fontWeight: 600 }}>{err}</span> : current ? "We use it for every new job you paste." : "We need it to show you what to change for each job. You can also add it later. A PDF works."}
            </span>
          </div>
          <button className="btn sec" onClick={pick}>{Icon.upload()}{current ? "Change" : "Add resume"}</button>
        </div>
      ) : state === "reading" ? (
        <div className="row"><Spinner size={22} label="Reading" /><span style={{ fontSize: 16, fontWeight: 600 }}>Reading {file}…</span></div>
      ) : (
        <div className="row" style={{ flexDirection: "column", alignItems: "stretch" }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Did we read your resume correctly?</div>
          <div className="mute" style={{ fontSize: 14 }}>Here&apos;s what we read from {file}. Your downloaded resumes will use one simple, clean layout, not your original design.</div>
          <div style={{ background: "var(--bg)", borderRadius: 18, padding: "16px 18px", fontSize: 15, lineHeight: 1.6, maxHeight: 320, overflow: "auto" }}>
            {lines.map((l, i) => l.startsWith("## ") ? <div key={i} style={{ fontWeight: 800, marginTop: 10 }}>{l.slice(3)}</div> : <div key={i}>{l}</div>)}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn pri" onClick={() => confirm(true)}>Yes, use this</button>
            <button className="btn sec" onClick={() => confirm(false)}>Something&apos;s wrong</button>
          </div>
          <div className="mute" style={{ fontSize: 13 }}>Jobs you already added keep the old resume. You can redo any of them with the new one from that job&apos;s page.</div>
        </div>
      )}
    </div>
  );
}
