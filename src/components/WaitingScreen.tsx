"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./ui";
import { ContactRows } from "./Contact";
import { CONTACT } from "@/lib/contact";
import { browserClient } from "@/lib/supabase/browser";

/** What a signed-in student sees until Rajveer approves them. */
export function WaitingScreen({ email, pendingLink, declineMessage }: { email: string; pendingLink?: string; declineMessage?: string | null }) {
  const router = useRouter();
  const [saved, setSaved] = useState("");

  // Keep the job they pasted, so it's waiting in the box once they're approved.
  useEffect(() => {
    try {
      if (pendingLink) localStorage.setItem("hf_pending_link", pendingLink);
      setSaved(localStorage.getItem("hf_pending_link") || "");
    } catch { /* storage blocked: fine */ }
  }, [pendingLink]);

  const waText = `Hi Rajveer, I signed up for Hunting Fox with ${email}. Could you let me in?`;
  async function signOut() {
    await browserClient().auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <main className="wrap" style={{ maxWidth: 600 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", marginTop: 24 }}>
        <span className="tile" style={{ width: 56, height: 56, borderRadius: 21, background: "#fff", border: "1px solid var(--line-card)", color: "var(--ink)" }}><svg aria-hidden width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2" /><path d="M9 2.5h6" /></svg></span>
        <h1 className="h1" style={{ marginTop: 24 }}>You&apos;re on the waiting list</h1>
        <p className="mute" style={{ margin: "12px 0 0", fontSize: 18, lineHeight: 1.5, maxWidth: "44ch" }}>
          Hunting Fox is free while we test it, so {CONTACT.name} lets every student in by hand. Send him a message and you&apos;ll get in faster.
        </p>
      </div>

      {declineMessage && (
        <section className="card" style={{ marginTop: 32, padding: 24 }}>
          <div className="lbl">A message from {CONTACT.name}</div>
          <div style={{ marginTop: 8, fontSize: 16, lineHeight: 1.6, whiteSpace: "pre-line" }}>{declineMessage.split("\n\n—\n")[0]}</div>
        </section>
      )}
      <section style={{ marginTop: 24 }} aria-label={`Contact ${CONTACT.name}`}>
        <ContactRows text={waText} primary />
      </section>
      <p className="mute" style={{ margin: "10px 8px 0", fontSize: 14 }}>Tell him the email you signed in with: <b style={{ color: "var(--ink)" }}>{email}</b></p>

      <section style={{ marginTop: 36 }}>
        <div className="lbl" style={{ margin: "0 8px" }}>What happens next</div>
        <ol className="card" style={{ margin: "12px 0 0", padding: "8px 20px", listStyle: "none" }}>
          {[
            ["Rajveer approves you", "You'll see it here the next time you open Hunting Fox."],
            ["You get your searches", "He decides how many each student gets while we test."],
            ["Paste any LinkedIn job", "We check the company, find people who work there, and show what to change in your resume."],
          ].map(([t, d], i) => (
            <li key={i} className="st">
              <span style={{ width: 28, height: 28, flex: "none", borderRadius: 11, background: "var(--bg)", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 14 }}>{i + 1}</span>
              <div><div style={{ fontSize: 16, fontWeight: 700 }}>{t}</div><div className="mute" style={{ fontSize: 14, lineHeight: 1.45, marginTop: 2 }}>{d}</div></div>
            </li>
          ))}
        </ol>
      </section>

      {saved && (
        <div className="card row" style={{ marginTop: 16 }}>
          <span style={{ color: "var(--green)" }}>{Icon.check(20)}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>We kept your job link</div>
            <div className="mute" style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{saved.replace(/^https?:\/\/(www\.)?/, "")}</div>
          </div>
        </div>
      )}

      <div style={{ marginTop: 32, display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
        <button className="btn on-grey" onClick={() => router.refresh()}>Check again</button>
        <button className="btn ghost" onClick={signOut}>Sign out</button>
      </div>
    </main>
  );
}
