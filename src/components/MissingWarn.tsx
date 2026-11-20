"use client";

import { useState } from "react";

const KEY = "hf:no-missing-warn";

/** True unless the student ticked "Don't warn me again". */
export function shouldWarn() {
  try { return localStorage.getItem(KEY) !== "1"; } catch { return true; }
}

/**
 * "Your resume is missing X": shown before saving the resume setup and before applying changes on a job.
 * Add them now (goes to the setup page) or continue anyway; "Don't warn me again" turns it off on this browser.
 */
export function MissingWarn({ missing, action, onContinue, onClose }: { missing: string[]; action: string; onContinue: () => void; onClose: () => void }) {
  const [never, setNever] = useState(false);
  function remember() { if (never) { try { localStorage.setItem(KEY, "1"); } catch { /* fine */ } } }
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="mw-t" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(16,24,40,.45)", display: "grid", placeItems: "center", padding: 16 }}>
      <div className="card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460, width: "100%", padding: "24px 22px 20px" }}>
        <h2 id="mw-t" style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: "-.02em" }}>⚠ Your resume is missing {missing.length === 1 ? "a section" : "some sections"}</h2>
        <p style={{ fontSize: 16, lineHeight: 1.5, margin: "10px 0 0" }}>Every resume should have these. Without them, recruiters may skip it:</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "12px 0 0" }}>
          {missing.map((m) => <span key={m} className="tag" style={{ background: "#ffefb0", color: "#4f3e00", fontWeight: 600 }}>{m}</span>)}
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 16, fontSize: 14, cursor: "pointer" }}>
          <input type="checkbox" checked={never} onChange={(e) => setNever(e.target.checked)} style={{ width: 18, height: 18 }} />
          Don&apos;t warn me again
        </label>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
          <a className="btn lg pri" href="/resume/setup" onClick={remember}>Add them now</a>
          <button className="btn lg sec" onClick={() => { remember(); onContinue(); }}>{action} anyway</button>
        </div>
      </div>
    </div>
  );
}
