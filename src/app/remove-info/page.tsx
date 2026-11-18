"use client";
import { useState } from "react";
import { BackLink } from "@/components/ui";

export default function Page() {
  const [contact, setContact] = useState("");
  const [done, setDone] = useState(false);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/remove-info", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contact }) });
    if (r.ok) setDone(true);
  }
  return (
    <main className="wrap">
      <BackLink href="/">Home</BackLink>
      <div className="card" style={{ marginTop: 12, padding: 28 }}>
        <h1 className="h2">Are you one of the people we show?</h1>
        <p className="mute" style={{ fontSize: 16, lineHeight: 1.5 }}>When a student applies to your company, we show them public details from your LinkedIn profile, like your name, your role and how long you&apos;ve worked there, so they know who to ask. If you&apos;d rather not be shown, tell us and we&apos;ll remove you within 2 days.</p>
        {done ? (
          <p style={{ fontWeight: 700, color: "var(--green)" }}>Thanks. We&apos;ll remove you within 2 days.</p>
        ) : (
          <form onSubmit={send} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <label htmlFor="rm" style={{ fontSize: 14, fontWeight: 600 }}>Your LinkedIn profile link or work email</label>
            <input id="rm" className="in" style={{ flex: "none" }} value={contact} onChange={(e) => setContact(e.target.value)} placeholder="linkedin.com/in/…" />
            <button className="btn dark" disabled={contact.trim().length < 5} style={{ alignSelf: "flex-start" }}>Remove me</button>
          </form>
        )}
      </div>
    </main>
  );
}
