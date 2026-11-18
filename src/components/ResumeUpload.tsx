"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Icon, Spinner, copyText } from "./ui";
import { ResumeDoc } from "./ResumeDoc";

/** For students with no resume, or one we can't read: paste into ChatGPT (or any AI), save the answer as a .txt file, upload it. */
const AI_PROMPT = `Write my resume in this exact plain-text format, using only facts I give you. Ask me questions first if you need more (education, internships, projects, skills, links). Don't invent anything.

# Full Name
> What I do in a few words, like: Android Developer | UI/UX Designer
@ email · phone · city · LinkedIn · GitHub · website
## Summary
Two lines about what I do.
## Experience
### Role, Company | Mon YYYY – Mon YYYY
- What I did and the result, with **numbers** and **main tools** in double stars
## Projects
### Project name | Mon YYYY
- What it does, what I built, what tools I used
## Education
### Degree, College | YYYY – YYYY
## Skills
**Languages:** ...
**Tools:** ...
## Achievements
- Awards or competitions, if any

Leave out any part I don't have.

When it's done, give me only the resume in that format, nothing else.`;

/** Upload → "Did we read your resume correctly?" → confirm. Used on Home, Account and the resume page. */
export function ResumeUpload({ signedIn, compact, current, onDone }: { signedIn: boolean; compact?: boolean; current?: string; onDone?: () => void }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "reading" | "check" | "error">("idle");
  const [lines, setLines] = useState<string[]>([]);
  const [file, setFile] = useState("");
  const [err, setErr] = useState("");
  const [missing, setMissing] = useState<string[]>([]);
  const [showPrompt, setShowPrompt] = useState(false);

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
      setErr(d.error === "unreadable" ? "We couldn't read any text in that file. If it's a scanned image, export it again as a PDF with text." : d.error === "too_big" ? "That file is over 5 MB. Try a smaller PDF." : d.error === "no_ai" ? "Hunting Fox isn't fully set up yet (no AI key). Rajveer is on it, so try again a bit later." : d.error === "ai_failed" ? "Our AI couldn't read it just now. Try again in a minute." : "Something went wrong reading it. Try again.");
      return setState("error");
    }
    setLines(d.lines || []);
    setMissing(d.missing || []);
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
          <span className="tile" style={{ background: current ? "var(--green-bg)" : "#EEF1F5", color: current ? "var(--green)" : "var(--pink)" }}>{Icon.doc()}</span>
          <div style={{ flex: "1 1 220px", minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 18, fontWeight: 700 }}>{current || "Add your resume"}</span>
            <span className="mute" style={{ fontSize: 14, lineHeight: 1.45 }}>
              {state === "error" ? <span style={{ color: "var(--red)", fontWeight: 600 }}>{err}</span> : current ? "We use it for every new job you paste." : "We need it to show you what to change for each job. You can also add it later. A PDF works."}
            </span>
          </div>
          <button className="btn sec" onClick={pick}>{Icon.upload()}{current ? "Change" : "Add resume"}</button>
          {!compact && (
            <div style={{ flex: "1 1 100%", fontSize: 14 }}>
              <button className="lnk" onClick={() => setShowPrompt(!showPrompt)} aria-expanded={showPrompt} style={{ background: "none", border: 0, padding: 0, color: "var(--ink)", fontWeight: 600, textDecoration: "underline", cursor: "pointer", fontSize: 14 }}>
                {current ? "Want to make a fresh one with ChatGPT?" : "No resume, or we can't read yours? Make one with ChatGPT"}
              </button>
              {showPrompt && (
                <div style={{ marginTop: 10, background: "var(--sunken)", borderRadius: 16, padding: 16 }}>
                  <p className="mute" style={{ margin: "0 0 10px", lineHeight: 1.5 }}>1. Copy this and paste it into ChatGPT (or any AI). 2. Answer its questions. 3. Save its answer as a .txt file. 4. Tap {current ? "Change" : "Add resume"} and pick that file.</p>
                  <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 14, lineHeight: 1.5 }}>{AI_PROMPT}</pre>
                  <button className="btn sec" style={{ marginTop: 10 }} onClick={async () => { await copyText(AI_PROMPT); }}>Copy</button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : state === "reading" ? (
        <div className="row"><Spinner size={22} label="Reading" /><span style={{ fontSize: 16, fontWeight: 600 }}>Reading {file}…</span></div>
      ) : (
        <div className="row" style={{ flexDirection: "column", alignItems: "stretch" }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Did we read your resume correctly?</div>
          <div className="mute" style={{ fontSize: 14 }}>Here&apos;s {file} in our resume layout. Every resume you download from Hunting Fox uses this layout.</div>
          {missing.length > 0 && (
            <div style={{ background: "#ffefb0", color: "#4f3e00", borderRadius: 14, padding: "12px 14px", fontSize: 14, lineHeight: 1.5 }}>
              <b>⚠ Worth adding to your resume</b>
              {missing.map((m) => <div key={m}>{m}</div>)}
            </div>
          )}
          <div style={{ background: "var(--bg)", borderRadius: 18, padding: "16px 12px" }}>
            <ResumeDoc lines={lines} />
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn pri" onClick={() => confirm(true)}>Yes, use this</button>
            <button className="btn sec" onClick={() => confirm(false)}>Something&apos;s wrong</button>
          </div>
          <div className="mute" style={{ fontSize: 14 }}>Jobs you already added keep the old resume. You can redo any of them with the new one from that job&apos;s page.</div>
        </div>
      )}
    </div>
  );
}
