"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon, copyText, useToast } from "./ui";
import { CONTACT } from "@/lib/contact";
import { browserClient } from "@/lib/supabase/browser";

const WhatsAppIcon = (s = 22) => (
  <svg aria-hidden width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4.2 19.8l1.2-4A8.5 8.5 0 1 1 8.6 19z" />
    <path d="M9.2 8.6c.2-.5.5-.5.8-.5h.5c.2 0 .4 0 .5.4l.6 1.4c.1.2 0 .4-.1.6l-.5.6c-.1.1-.1.3 0 .5a5.6 5.6 0 0 0 2.4 2.1c.2.1.4.1.5 0l.6-.7c.2-.2.4-.2.6-.1l1.4.7c.2.1.3.3.3.5 0 .9-.7 1.6-1.6 1.7-2.8.2-6-2.9-5.9-5.6 0-.6.2-1.2.4-1.6z" />
  </svg>
);

const CopyIcon = (s = 18) => (
  <svg aria-hidden width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="8" width="12" height="12" rx="3" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>
);

/** What a signed-in student sees until Rajveer approves them. */
export function WaitingScreen({ email, pendingLink }: { email: string; pendingLink?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [saved, setSaved] = useState("");

  // Keep the job they pasted, so it's waiting in the box once they're approved.
  useEffect(() => {
    try {
      if (pendingLink) localStorage.setItem("hf_pending_link", pendingLink);
      setSaved(localStorage.getItem("hf_pending_link") || "");
    } catch { /* storage blocked: fine */ }
  }, [pendingLink]);

  const waText = encodeURIComponent(`Hi Rajveer, I signed up for Hunting Fox with ${email}. Could you let me in?`);
  const rows = [
    { key: "email", icon: Icon.mail(22), tint: ["#E8F0FB", "#164A88"], label: "Email", value: CONTACT.email, copyValue: CONTACT.email, href: `mailto:${CONTACT.email}?subject=${encodeURIComponent("Hunting Fox access")}&body=${waText}`, open: "Write an email" },
    { key: "wa", icon: WhatsAppIcon(22), tint: ["#E3F6EA", "#0F7A3D"], label: "WhatsApp", value: CONTACT.whatsappDisplay, copyValue: `+${CONTACT.whatsappDigits}`, href: `https://wa.me/${CONTACT.whatsappDigits}?text=${waText}`, open: "Open WhatsApp" },
  ];

  async function copy(v: string, what: string) {
    toast.show((await copyText(v)) ? `${what} copied` : "Select it to copy");
  }
  async function signOut() {
    await browserClient().auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <main className="wrap" style={{ maxWidth: 600 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", marginTop: 24 }}>
        <span className="lm" style={{ width: 64, height: 64, borderRadius: 24 }}>{Icon.fox(34)}</span>
        <h1 className="h1" style={{ marginTop: 24, fontSize: "clamp(30px,5vw,40px)" }}>You&apos;re on the waiting list</h1>
        <p className="mute" style={{ margin: "14px 0 0", fontSize: 17, lineHeight: 1.55, maxWidth: "44ch" }}>
          Hunting Fox is free while we test it, so {CONTACT.name} lets every student in by hand. Send him a message and you&apos;ll get in faster.
        </p>
      </div>

      <section className="card" style={{ marginTop: 32 }} aria-label={`Contact ${CONTACT.name}`}>
        {rows.map((r) => (
          <div key={r.key} className="row" style={{ padding: "18px 20px" }}>
            <span className="tile" style={{ background: r.tint[0], color: r.tint[1] }}>{r.icon}</span>
            <div style={{ flex: "1 1 200px", minWidth: 0 }}>
              <div className="mute" style={{ fontSize: 13, fontWeight: 700 }}>{r.label}</div>
              <div style={{ fontSize: 17, fontWeight: 700, userSelect: "all", wordBreak: "break-all" }}>{r.value}</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn sec" style={{ minWidth: 44, padding: "0 12px" }} onClick={() => copy(r.copyValue, r.label === "Email" ? "Email" : "Number")} aria-label={`Copy ${r.label.toLowerCase()}`}>{CopyIcon()}<span className="hide-sm">Copy</span></button>
              <a className="btn dark" href={r.href} target={r.key === "wa" ? "_blank" : undefined} rel="noopener">{r.open}</a>
            </div>
          </div>
        ))}
      </section>
      <p className="mute" style={{ margin: "10px 8px 0", fontSize: 13 }}>Tell him the email you signed in with: <b style={{ color: "var(--ink)" }}>{email}</b></p>

      <section style={{ marginTop: 36 }}>
        <div className="lbl" style={{ margin: "0 8px" }}>What happens next</div>
        <ol className="card" style={{ margin: "12px 0 0", padding: "8px 20px", listStyle: "none" }}>
          {[
            ["Rajveer approves you", "You'll see it here the next time you open Hunting Fox."],
            ["You get your searches", "He decides how many each student gets while we test."],
            ["Paste any LinkedIn or Naukri job", "We check the company, find people who work there, and show what to change in your resume."],
          ].map(([t, d], i) => (
            <li key={i} className="st">
              <span style={{ width: 28, height: 28, flex: "none", borderRadius: 11, background: "var(--bg)", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 14 }}>{i + 1}</span>
              <div><div style={{ fontSize: 16, fontWeight: 700 }}>{t}</div><div className="mute" style={{ fontSize: 14, lineHeight: 1.45, marginTop: 2 }}>{d}</div></div>
            </li>
          ))}
        </ol>
      </section>

      {saved && (
        <div className="card row" style={{ marginTop: 16 }}>
          <span style={{ color: "var(--green)" }}>{Icon.check(20)}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>We kept your job link</div>
            <div className="mute" style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{saved.replace(/^https?:\/\/(www\.)?/, "")}</div>
          </div>
        </div>
      )}

      <div style={{ marginTop: 32, display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
        <button className="btn on-grey" onClick={() => router.refresh()}>Check again</button>
        <button className="btn ghost" onClick={signOut}>Sign out</button>
      </div>
      {toast.el}
    </main>
  );
}
