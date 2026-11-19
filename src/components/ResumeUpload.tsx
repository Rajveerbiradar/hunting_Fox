"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon, Spinner, copyText } from "./ui";

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

/** Upload → read in the background → straight to /resume/setup to check it part by part. Used on Home, Account and the resume page. */
export function ResumeUpload({ signedIn, compact, current }: { signedIn: boolean; compact?: boolean; current?: string; onDone?: () => void }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "reading" | "check" | "error">("idle");
  const [file, setFile] = useState("");
  const [err, setErr] = useState("");
  const [showPrompt, setShowPrompt] = useState(false);

  function pick() {
    if (!signedIn) return router.push("/sign-in");
    input.current?.click();
  }

  const ERR: Record<string, string> = {
    unreadable: "We couldn't read any text in that file. If it's a scanned image, export it again as a PDF with text.",
    too_big: "That file is over 5 MB. Try a smaller PDF.",
    no_ai: "Hunting Fox isn't fully set up yet (no AI key). Rajveer is on it, so try again a bit later.",
    ai_failed: "Our AI couldn't respond. Upload it again in a minute.",
    budget: "The AI budget allocated to you is finished. AI credits are separate from your search credits. Hunting Fox is a personal project with a limited budget, so please ask the admin for more AI credits.",
  };
  type Up = { status: "reading" | "done" | "failed"; file_name: string; missing?: string[]; error?: string };

  function show(up: Up | null) {
    if (!up) return;
    setFile(up.file_name);
    if (up.status === "reading") setState("reading");
    else if (up.status === "failed") { setErr(ERR[up.error || ""] || ERR.ai_failed); setState("error"); }
    // Read: go straight to checking it part by part (the notice is cleared so this happens once).
    else { setState("check"); void openSetup(); }
  }

  async function openSetup() {
    await fetch("/api/resume", { method: "DELETE" }).catch(() => null);
    router.push("/resume/setup?new=1");
  }

  // The reading happens on the server. Pick up where it is when the page opens, then check every 3 s while reading.
  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    let t: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const d = await fetch("/api/resume", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      if (!alive || !d) return;
      show(d.upload);
      if (d.upload?.status === "reading") t = setTimeout(tick, 3000);

    };
    if (state === "reading" || state === "idle") t = setTimeout(tick, state === "reading" ? 3000 : 0);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, state === "reading"]);

  async function upload(f: File) {
    setFile(f.name);
    setState("reading");
    const fd = new FormData();
    fd.append("file", f);
    const r = await fetch("/api/resume", { method: "POST", body: fd }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    if (!r || !r.ok) { setErr(ERR[d.error] || "Something went wrong uploading it. Try again."); return setState("error"); }
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
        <div className="row" style={{ padding: "16px 18px", alignItems: "flex-start" }}>
          <Spinner size={22} label="Reading" />
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 16, fontWeight: 700 }}>Reading {file} and putting it in our layout…</span>
            <span className="mute" style={{ fontSize: 14, lineHeight: 1.45 }}>This takes about a minute. You can leave this page or paste a job. We keep going, and it&apos;ll be ready here when you come back.</span>
          </div>
        </div>
      ) : (
        <div className="row" style={{ padding: "16px 18px", alignItems: "center" }}>
          <Spinner size={22} label="Opening" />
          <span style={{ fontSize: 16, fontWeight: 700 }}>✓ Read {file}. Opening it part by part…</span>
        </div>
      )}
    </div>
  );
}
