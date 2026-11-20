"use client";

import { ResumeUpload } from "./ResumeUpload";
import { Icon } from "./ui";

export const PENDING_LINK = "hf_pending_link";

/** Keep a job link for later (after the resume is in). */
export function saveLink(link: string) {
  try { localStorage.setItem(PENDING_LINK, link); } catch { /* storage blocked */ }
}

/**
 * Shown when a signed-in student presses start without a resume: same look as the sign-in screen.
 * The link is saved; the upload is the one big next step. When the read finishes, the upload card opens
 * /resume/setup, which offers to start the saved search.
 */
export function NeedResume({ link, onClose }: { link: string; onClose: () => void }) {
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="nr-t" style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(16,24,40,.45)", display: "grid", placeItems: "center", padding: 16, overflowY: "auto" }} onClick={onClose}>
      <div className="card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520, width: "100%", padding: "26px 22px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <h1 id="nr-t" className="h1" style={{ margin: 0 }}>Upload your resume to start</h1>
          <p className="mute" style={{ margin: "10px 0 0", fontSize: 16, lineHeight: 1.5 }}>We need your resume to tell you what to change for this job. It takes about a minute.</p>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", background: "var(--sunken)", borderRadius: 16, padding: "12px 14px" }}>
          <span style={{ color: "#1a6b3c", display: "grid", placeItems: "center" }}>{Icon.link()}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Your job link is saved here</div>
            <div className="mute" style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{link.replace(/^https?:\/\/(www\.)?/, "")}</div>
          </div>
        </div>
        <div className="glow" style={{ borderRadius: 20, padding: 4 }}>
          <ResumeUpload signedIn />
        </div>
        <p className="mute" style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>Once it&apos;s read, you can fix anything we got wrong, then start the search with this link in one tap.</p>
        <button className="btn ghost" onClick={onClose}>Not now</button>
      </div>
    </div>
  );
}
