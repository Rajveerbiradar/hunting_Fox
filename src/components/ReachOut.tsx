"use client";
import { useState } from "react";
import { PdfButton } from "./PdfButton";
import { Header, Icon, copyText, letterTile, useToast } from "./ui";
import type { Person } from "@/lib/pipeline/types";

const enc = encodeURIComponent;

/** The people we found at the company: who they are, why they're worth contacting, their LinkedIn and any work email.
 *  We don't write messages: the student writes their own. */
export function ReachOut(p: { jobId: string; company: string; big: boolean; people: Person[]; hiringEmail?: string; sentTo: string[]; initial: string }) {
  const people = p.people;
  const [sel, setSel] = useState(people[0]?.id);
  const [sent, setSent] = useState<string[]>(p.sentTo);
  const toast = useToast();
  const cur = people.find((x) => x.id === sel);
  const hasEmail = (x: Person) => !!(x.email && x.emailFound);

  async function toggleSent(id: string) {
    const next = sent.includes(id) ? sent.filter((x) => x !== id) : [...sent, id];
    setSent(next);
    await fetch(`/api/jobs/${p.jobId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ sent_to: next }) });
  }
  async function copy(t: string, m: string) { toast.show((await copyText(t)) ? m : "Select the text to copy it"); }

  const Card = (x: Person) => {
    const t = letterTile(x.name);
    return (
      <button key={x.id} className="card pc" aria-pressed={sel === x.id} onClick={() => setSel(x.id)}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="tile" style={{ background: t.bg, color: t.fg, fontWeight: 700 }}>{t.letters}</span>
          <span style={{ minWidth: 0 }}><span style={{ display: "block", fontSize: 16, fontWeight: 700 }}>{x.name}</span><span className="mute" style={{ display: "block", fontSize: 14 }}>{x.title}</span></span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <span className="tag" style={x.active === "Active" ? { background: "var(--green-bg)", color: "#1A6B3C" } : { background: "#EEF1F5", color: "var(--mute)" }}>{x.active}</span>
          {hasEmail(x) && <span className="tag" style={{ background: "var(--green-bg)", color: "#1A6B3C" }}>✓ Work email</span>}
          {sent.includes(x.id) && <span className="tag" style={{ background: "#E7EFFA", color: "#164A88" }}>✓ Contacted</span>}
        </div>
      </button>
    );
  };

  return (
    <>
      <Header signedIn initial={p.initial} back={{ href: `/jobs/${p.jobId}`, label: `Back to ${p.company}` }} />
      <main className="wrap wide">
        <h1 style={{ margin: "8px 0 0", fontSize: "clamp(28px,4vw,38px)", lineHeight: 1.1, fontWeight: 700, letterSpacing: "-.03em" }}>People at {p.company}</h1>
        <p className="mute" style={{ margin: "8px 0 0", fontSize: 16, lineHeight: 1.5 }}>
          {p.big ? "Contact people before you apply and politely ask for a referral. If no one replies in 12 hours, apply yourself." : "Contact people after you apply. Ask for their help in finding the right person, which works better than asking a stranger for a referral."} Write in your own words, and attach your resume.
        </p>

        {people.length === 0 ? (
          <div className="card" style={{ marginTop: 24, padding: 26 }}>
            <h2 className="h2" style={{ fontSize: 18 }}>We couldn&apos;t find anyone who works here</h2>
            <p className="mute" style={{ fontSize: 16, lineHeight: 1.5 }}>Nobody at {p.company} has a public LinkedIn profile we could find. You can still apply directly.{p.hiringEmail ? ` We did find their hiring email: ${p.hiringEmail}.` : ""}</p>
          </div>
        ) : (
          <>
            <div style={{ marginTop: 28 }}><span className="lbl">Best first · start with the top 2</span></div>
            <div className="people" style={{ marginTop: 12 }}>{people.map(Card)}</div>

            {cur && (
              <section className="card" style={{ marginTop: 24, padding: 26 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0, flex: "1 1 260px" }}>
                    <h2 className="h2">{cur.name}</h2>
                    <p className="mute" style={{ margin: "6px 0 0", fontSize: 16, lineHeight: 1.5 }}>{cur.title}{cur.why ? ` · ${cur.why}` : ""}</p>
                  </div>
                  <button className="btn" style={sent.includes(cur.id) ? { background: "#E7EFFA", color: "#164A88" } : { background: "var(--bg)" }} onClick={() => toggleSent(cur.id)} aria-pressed={sent.includes(cur.id)}>{sent.includes(cur.id) ? "✓ Contacted" : "I contacted them"}</button>
                </div>

                <div style={{ marginTop: 18, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                  {cur.profileUrl && <a className="btn sec" href={cur.profileUrl} target="_blank" rel="noopener">View {cur.first} on LinkedIn{Icon.ext()}</a>}
                  {hasEmail(cur) ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span className="tag" style={{ background: "var(--green-bg)", color: "#1A6B3C" }}>✓ Work email</span>
                      <span style={{ fontSize: 16, fontWeight: 700, userSelect: "all", wordBreak: "break-all" }}>{cur.email}</span>
                      <button className="btn sec" style={{ minHeight: 36, fontSize: 14 }} onClick={() => copy(cur.email!, "Address copied")}>Copy</button>
                      <a className="btn sec" style={{ minHeight: 36, fontSize: 14 }} target="_blank" rel="noopener" href={`https://mail.google.com/mail/?view=cm&to=${enc(cur.email!)}`}>Open in Gmail</a>
                    </span>
                  ) : <span className="mute" style={{ fontSize: 14 }}>No work email found. Contact {cur.first} on LinkedIn.</span>}
                </div>
                {cur.profileUrl && <p className="mute" style={{ margin: "8px 0 0", fontSize: 14 }}>If their profile looks hidden to you, the LinkedIn link still opens it once you&apos;re signed in.</p>}
                <p style={{ margin: "16px 0 0", fontSize: 14, lineHeight: 1.5, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <b>Attach your resume when you write.</b>
                  <PdfButton source={`/api/jobs/${p.jobId}/resume-lines`} className="btn sec" style={{ minHeight: 36, fontSize: 14 }}>Download the PDF for {p.company}</PdfButton>
                </p>
              </section>
            )}
          </>
        )}

        {p.hiringEmail && people.length > 0 && (
          <section className="card row" style={{ marginTop: 16 }}>
            <span className="tile" style={{ background: "#EEF1F5", fontWeight: 700 }}>HR</span>
            <div style={{ flex: "1 1 220px", minWidth: 0 }}><div style={{ fontSize: 16, fontWeight: 700 }}>Hiring inbox · <span style={{ userSelect: "all" }}>{p.hiringEmail}</span></div><div className="mute" style={{ fontSize: 14 }}>Listed on the job post.</div></div>
            <a className="btn sec" target="_blank" rel="noopener" href={`https://mail.google.com/mail/?view=cm&to=${enc(p.hiringEmail)}`}>Open in Gmail</a>
          </section>
        )}
        <p className="mute" style={{ margin: "20px 8px 0", fontSize: 14 }}>Names and roles come from public LinkedIn profiles. When an email says &quot;Our best guess&quot;, it may not reach them. We never send anything for you.</p>
      </main>
      {toast.el}
    </>
  );
}
