"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "./ui";
import { ContactRows } from "./Contact";

type Req = { id: string; status: "waiting" | "approved" | "declined"; granted: number | null; waitlist: boolean; message: string | null; note: string | null; created_at: string; answered_at: string | null; seen_at: string | null };

const OwnKeyNudge = () => (
  <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "14px 16px", border: "1px solid var(--line)", borderRadius: 18, cornerShape: "squircle", background: "#fff" } as React.CSSProperties}>
    <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none", marginTop: 1 }}><circle cx="8" cy="15" r="4.5" /><path d="M11.2 11.8L20 3" /><path d="M16 7l3 3" /><path d="M14 9l2 2" /></svg>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 16, fontWeight: 700 }}>Don&apos;t want to wait? Use your own key</div>
      <div className="mute" style={{ fontSize: 14, lineHeight: 1.5, marginTop: 2 }}>Apify gives every account $5 free each month, about 110 searches. Add your key, and your searches won&apos;t count or use Rajveer&apos;s credit.</div>
      <Link href="/account#keys" style={{ display: "inline-block", marginTop: 8, fontSize: 16, fontWeight: 600, padding: "6px 0" }}>Add my own keys →</Link>
    </div>
  </div>
);

/**
 * Home card for searches: out of searches → ask for more; asked → waiting;
 * answered → yes (with contact) or not now (waiting list, own key, contact).
 */
export function AskMore({ left, used }: { left: number; used: number }) {
  const [req, setReq] = useState<Req | null | undefined>(undefined);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/requests", { cache: "no-store" }).then((r) => r.json()).then((d) => setReq(d.request || null)).catch(() => setReq(null));
  }, []);

  if (req === undefined) return null;
  const answeredUnseen = req && req.status !== "waiting" && !req.seen_at;
  const dismiss = () => { fetch("/api/requests", { method: "PATCH" }); setReq(req ? { ...req, seen_at: new Date().toISOString() } : req); };

  // A yes Rajveer just gave: show it once.
  if (answeredUnseen && req.status === "approved") {
    return (
      <section className="card" style={{ marginTop: 24, padding: 24, display: "flex", flexDirection: "column", gap: 12 }} aria-live="polite">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="tile" style={{ width: 44, height: 44, background: "var(--green-bg)", color: "var(--green)" }}>{Icon.check(22)}</span>
          <div style={{ flex: 1 }}><div style={{ fontSize: 18, fontWeight: 700 }}>You&apos;ve got {req.granted} more searches</div><div className="mute" style={{ fontSize: 14 }}>Rajveer added them. You have {left} left.</div></div>
          <button className="btn ghost" style={{ minWidth: 44, padding: 0 }} aria-label="Dismiss" onClick={dismiss}>{Icon.x()}</button>
        </div>
        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Got a reply or an interview?</div>
          <div className="mute" style={{ fontSize: 14, margin: "2px 0 10px" }}>Rajveer would love to hear about it.</div>
          <ContactRows text="Hi Rajveer, news from my Hunting Fox job search:" />
        </div>
      </section>
    );
  }

  if (left > 0) return null;

  // Not now: on the waiting list.
  if (req && req.status === "declined") {
    return (
      <section className="card" style={{ marginTop: 24, padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="tile" style={{ width: 44, height: 44, background: "var(--tile)", color: "var(--ink)" }}><svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2" /><path d="M9 2.5h6" /></svg></span>
          <div><div style={{ fontSize: 18, fontWeight: 700 }}>{req.waitlist ? "You're on the waiting list for more searches" : "No more searches for now"}</div><div className="mute" style={{ fontSize: 14 }}>A message from Rajveer</div></div>
        </div>
        <div style={{ fontSize: 16, lineHeight: 1.6, whiteSpace: "pre-line" }}>{(req.message || "").split("\n\n—\n")[0]}</div>
        <OwnKeyNudge />
        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Questions?</div>
          <div className="mute" style={{ fontSize: 14, margin: "2px 0 10px" }}>Message Rajveer.</div>
          <ContactRows text="Hi Rajveer, about my Hunting Fox searches:" />
        </div>
      </section>
    );
  }

  // Asked, waiting for an answer.
  if (req && req.status === "waiting") {
    return (
      <section className="card" style={{ marginTop: 24, padding: 24, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>You asked for more searches</div>
        <p className="mute" style={{ margin: 0, fontSize: 16, lineHeight: 1.5 }}>You asked after using all {used}. Rajveer usually answers within a day. You don&apos;t need to ask again.</p>
        {req.note && <div className="note" style={{ fontSize: 14 }}><span className="mute">Your note:</span> “{req.note}”</div>}
        <OwnKeyNudge />
        <Link href="/jobs" className="btn sec" style={{ alignSelf: "flex-start" }}>See my jobs</Link>
      </section>
    );
  }

  // Out of searches.
  return (
    <section className="card task" style={{ marginTop: 24, padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 18, fontWeight: 700 }}>You&apos;ve used all your searches</div>
      <p className="mute" style={{ margin: 0, fontSize: 16, lineHeight: 1.5 }}>Everything you&apos;ve found so far is still here: your resumes, messages and job list. Ask for more, and Rajveer will add them once he sees it.</p>
      <label htmlFor="why" style={{ fontSize: 14, fontWeight: 600 }}>Tell Rajveer how it&apos;s going (optional)</label>
      <textarea id="why" className="ta" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Got 2 replies already, placements start next week" />
      <button className="btn pri" style={{ alignSelf: "flex-start" }} disabled={busy} onClick={async () => {
        setBusy(true);
        await fetch("/api/requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ note }) });
        const d = await fetch("/api/requests", { cache: "no-store" }).then((r) => r.json()).catch(() => ({}));
        setReq(d.request || null); setBusy(false);
      }}>Ask for more searches</button>
      <OwnKeyNudge />
    </section>
  );
}
