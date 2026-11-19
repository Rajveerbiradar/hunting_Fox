"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Header, Spinner } from "./ui";
import { ResumeDoc } from "./ResumeDoc";
import type { ResumeGroup } from "@/lib/resumeGroups";

type Setup = Record<string, { state: "ok" | "edited"; at: string }>;
type Last = { before: string[]; changed: string };

const ERR: Record<string, string> = {
  changed: "Your resume changed in another tab. We've loaded the latest version, so check this part again.",
  budget: "The AI budget allocated to you is finished. Ask Rajveer for more.",
  no_ai: "Our AI isn't set up right now. Try again later.",
  ai_failed: "Our AI couldn't make that change. Try again.",
  empty: "Write what's wrong or what to add first.",
};

/**
 * Resume setup: every part of the student's main resume (top, summary, each job and project, skills…) with
 * "Is this written right?" and a box to write what's wrong or what to add. The AI changes only that part,
 * and the note is kept as a fact for every future job.
 */
export function ResumeSetup({ initial, fresh }: { initial: string; fresh?: boolean }) {
  const [groups, setGroups] = useState<ResumeGroup[] | null>(null);
  const [setup, setSetup] = useState<Setup>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string>("");
  const [err, setErr] = useState<Record<string, string>>({});
  const [last, setLast] = useState<Record<string, Last>>({});
  // Straight after an upload: a short note on how to use this page.
  const [intro, setIntro] = useState(!!fresh);
  const [missing, setMissing] = useState<string[]>([]);

  async function load() {
    const d = await fetch("/api/resume/setup", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (d?.groups) { setGroups(d.groups); setSetup(d.setup || {}); setMissing(d.missing || []); }
    else setGroups([]);
  }
  useEffect(() => { void load(); }, []);

  async function post(g: ResumeGroup, body: Record<string, unknown>) {
    setBusy(g.key);
    setErr((e) => ({ ...e, [g.key]: "" }));
    const r = await fetch("/api/resume/setup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: g.key, lines: g.lines, ...body }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setBusy("");
    if (!r || !r.ok) {
      setErr((e) => ({ ...e, [g.key]: ERR[d.error] || ERR.ai_failed }));
      if (d.error === "changed") await load();
      return null;
    }
    return d;
  }

  async function ok(g: ResumeGroup) {
    if (await post(g, { action: "ok" })) setSetup((s) => ({ ...s, [g.key]: { state: "ok", at: new Date().toISOString() } }));
  }

  async function fix(g: ResumeGroup) {
    const d = await post(g, { action: "fix", note: notes[g.key] || "" });
    if (!d) return;
    setLast((l) => ({ ...l, [d.key]: { before: d.before, changed: d.changed } }));
    setNotes((n) => ({ ...n, [g.key]: "" }));
    setOpen((o) => ({ ...o, [g.key]: false, [d.key]: false }));
    await load();
  }

  async function undo(g: ResumeGroup) {
    const l = last[g.key];
    if (!l) return;
    const d = await post(g, { action: "restore", to: l.before });
    if (!d) return;
    setLast((x) => { const y = { ...x }; delete y[g.key]; return y; });
    await load();
  }

  const done = groups ? groups.filter((g) => setup[g.key]).length : 0;

  function closeIntro() {
    setIntro(false);
    // Drop ?new=1 so a refresh doesn't show it again.
    try { window.history.replaceState(null, "", "/resume/setup"); } catch { /* old browser */ }
  }

  return (
    <>
      <Header signedIn initial={initial} back={{ href: "/account", label: "Back to account" }} />
      <main className="wrap">
        <div style={{ margin: "0 8px" }}>
          <h1 style={{ margin: 0, fontSize: "clamp(30px,4vw,36px)", fontWeight: 700, letterSpacing: "-.03em" }}>Check your resume</h1>
          <p className="mute" style={{ fontSize: 16, lineHeight: 1.5, margin: "8px 0 0" }}>
            This is what we read from your resume, one part at a time. Every resume we make for a job starts from this, so anything wrong here ends up in all of them. For each part, tell us if it&apos;s right, or write what&apos;s wrong, what&apos;s missing or what you&apos;d change.
          </p>
          {groups && groups.length > 0 && <p style={{ fontSize: 14, fontWeight: 600, margin: "12px 0 0" }}>{done} of {groups.length} parts checked</p>}
        </div>

        {intro && groups && groups.length > 0 && (
          <div role="dialog" aria-modal="true" aria-labelledby="intro-t" onClick={closeIntro} style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(16,24,40,.45)", display: "grid", placeItems: "center", padding: 16 }}>
            <div className="card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480, width: "100%", padding: "24px 24px 20px" }}>
              <h2 id="intro-t" style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: "-.02em" }}>We read your resume</h2>
              <p style={{ fontSize: 16, lineHeight: 1.55, margin: "10px 0 0" }}>Go through it part by part and change anything the way you like.</p>
              <p style={{ fontSize: 16, lineHeight: 1.55, margin: "10px 0 0" }}><b>Don&apos;t worry about spelling or getting the words perfect.</b> Leave that to us. Just write what you want in your own words, and we&apos;ll turn it into a well-written resume.</p>
              {missing.length > 0 && (
                <div style={{ marginTop: 14, background: "var(--sunken)", borderRadius: 14, padding: "12px 14px", fontSize: 14, lineHeight: 1.5 }}>
                  <b>Worth adding</b>
                  {missing.map((m) => <div key={m}>{m}</div>)}
                </div>
              )}
              <button className="btn lg pri" style={{ marginTop: 18, width: "100%" }} onClick={closeIntro} autoFocus>Start checking</button>
            </div>
          </div>
        )}

        {!groups && <div className="card" style={{ marginTop: 20, padding: 24, display: "flex", gap: 12, alignItems: "center" }}><Spinner size={22} label="Loading" /><span className="mute">Loading your resume…</span></div>}

        {groups && !groups.length && (
          <div className="card" style={{ marginTop: 20, padding: 24 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>No resume yet</div>
            <p className="mute" style={{ margin: "6px 0 12px" }}>Add your resume on your account page first. Then come back here to check it.</p>
            <Link href="/account" className="btn sec">Go to my account</Link>
          </div>
        )}

        {groups?.map((g) => {
          const st = setup[g.key]?.state;
          const isOpen = open[g.key];
          const l = last[g.key];
          return (
            <section key={g.key} className="card" style={{ marginTop: 16, padding: "18px 18px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                  {g.section && <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--mute)" }}>{g.section}</div>}
                  <h2 style={{ margin: "2px 0 0", fontSize: 18, fontWeight: 700 }}>{g.title}</h2>
                </div>
                {st === "ok" && <span className="tag" style={{ background: "#e5f3e9", color: "#1a6b3c" }}>✓ Looks right</span>}
                {st === "edited" && <span className="tag" style={{ background: "#e7effa", color: "#164a88" }}>✓ Updated</span>}
              </div>

              <div style={{ background: "var(--bg)", borderRadius: 18, padding: "12px 12px", marginTop: 12 }}>
                {/* ResumeDoc draws its first line as the name, so every other part starts with an empty line. */}
                <ResumeDoc lines={g.kind === "top" ? g.lines : ["", ...g.lines]} />
              </div>

              {l && (
                <div style={{ marginTop: 10, fontSize: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ color: "#1a6b3c", fontWeight: 600 }}>{l.changed || "Updated with what you wrote."}</span>
                  <button className="btn ghost sm" disabled={busy === g.key} onClick={() => undo(g)}>Undo</button>
                </div>
              )}

              {!isOpen ? (
                <div style={{ marginTop: 12 }}>
                  <p style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 600 }}>Is this written right? Anything to add or change?</p>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button className="btn sec" disabled={busy === g.key} onClick={() => ok(g)}>Yes, it&apos;s right</button>
                    <button className="btn sec" onClick={() => setOpen((o) => ({ ...o, [g.key]: true }))}>Add or change something</button>
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: 12 }}>
                  <label htmlFor={`n-${g.key}`} style={{ display: "block", fontSize: 16, fontWeight: 600, marginBottom: 8 }}>What&apos;s wrong, missing, or what would you change?</label>
                  <textarea
                    id={`n-${g.key}`} className="ta" rows={4} maxLength={3000}
                    value={notes[g.key] || ""}
                    onChange={(e) => setNotes((n) => ({ ...n, [g.key]: e.target.value }))}
                    placeholder="Write it your way, in rough lines. For example: what this project really is, a claim that isn't true, a number that's wrong, something you did that isn't here."
                  />
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10, alignItems: "center" }}>
                    <button className="btn sec" disabled={busy === g.key || (notes[g.key] || "").trim().length < 3} onClick={() => fix(g)}>
                      Update this part
                    </button>
                    <button className="btn ghost" disabled={busy === g.key} onClick={() => setOpen((o) => ({ ...o, [g.key]: false }))}>Cancel</button>
                  </div>
                  <p className="mute" style={{ fontSize: 14, margin: "8px 0 0" }}>We change only this part, using only what you wrote. We also remember it for every job you add later.</p>
                </div>
              )}

              {err[g.key] && <p style={{ margin: "10px 0 0", fontSize: 14, fontWeight: 600, color: "#b8132f" }}>{err[g.key]}</p>}
            </section>
          );
        })}

        {groups && groups.length > 0 && (
          <div style={{ margin: "24px 8px 0", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <Link href="/account" className="btn pri lg">Done</Link>
            <span className="mute" style={{ fontSize: 14 }}>Jobs you already added keep their old suggestions. Use &quot;Try again&quot; on a job&apos;s resume page to redo it with this version.</span>
          </div>
        )}
      </main>
    </>
  );
}
