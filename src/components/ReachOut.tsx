"use client";
import { useState } from "react";
import { BackLink, Header, Icon, Spinner, copyText, letterTile, useToast } from "./ui";
import type { Person } from "@/lib/pipeline/types";

const enc = encodeURIComponent;

export function ReachOut(p: { jobId: string; company: string; big: boolean; people: Person[]; hiringEmail?: string; sentTo: string[]; initial: string; missingName: boolean }) {
  const [people, setPeople] = useState(p.people);
  const [sel, setSel] = useState(people[0]?.id);
  const [more, setMore] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  async function rewrite() {
    setRewriting(true);
    const r = await fetch(`/api/jobs/${p.jobId}/more`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rewrite: true }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    if (d.people) setPeople(d.people);
    setRewriting(false);
  }
  const [loadingMore, setLoadingMore] = useState(false);
  const [sent, setSent] = useState<string[]>(p.sentTo);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [bodies, setBodies] = useState<Record<string, string>>({});
  const toast = useToast();

  const cur = people.find((x) => x.id === sel);
  const note = cur ? notes[cur.id] ?? cur.note ?? "" : "";
  const body = cur ? bodies[cur.id] ?? cur.body ?? "" : "";

  async function showMore() {
    setMore(!more);
    if (more || people.slice(2).every((x) => x.written)) return;
    setLoadingMore(true);
    const r = await fetch(`/api/jobs/${p.jobId}/more`, { method: "POST" });
    const d = await r.json().catch(() => ({}));
    if (d.people) setPeople(d.people);
    setLoadingMore(false);
  }
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
          {sent.includes(x.id) && <span className="tag" style={{ background: "#E7EFFA", color: "#164A88" }}>✓ Sent</span>}
        </div>
      </button>
    );
  };

  return (
    <>
      <Header signedIn initial={p.initial} />
      <main className="wrap wide">
        <BackLink href={`/jobs/${p.jobId}`}>Back to {p.company}</BackLink>
        <h1 style={{ margin: "8px 0 0", fontSize: "clamp(28px,4vw,38px)", lineHeight: 1.1, fontWeight: 700, letterSpacing: "-.03em" }}>Message people at {p.company}</h1>
        <p className="mute" style={{ margin: "8px 0 0", fontSize: 16, lineHeight: 1.5 }}>
          {p.big ? "Send these before you apply. Politely ask for a referral; if no one replies in 12 hours, apply yourself." : "Send these after you apply. Ask for their help in finding the right person, which works better than asking a stranger for a referral."} Each message is written for that person from their profile. Change anything you like before sending.
        </p>

        {people.length === 0 ? (
          <div className="card" style={{ marginTop: 24, padding: 26 }}>
            <h2 className="h2" style={{ fontSize: 18 }}>We couldn&apos;t find anyone who works here</h2>
            <p className="mute" style={{ fontSize: 16, lineHeight: 1.5 }}>Nobody at {p.company} has a public LinkedIn profile we could find. You can still apply directly.{p.hiringEmail ? ` We did find their hiring email: ${p.hiringEmail}.` : ""}</p>
          </div>
        ) : (
          <>
            <div style={{ marginTop: 28, display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <span className="lbl">Start with {people.length > 1 ? "these 2" : "this person"}</span>
              <button className="btn ghost sm" disabled={rewriting} onClick={rewrite}>{rewriting ? <Spinner size={16} /> : null}{rewriting ? "Writing them again…" : "Write them again"}</button>
            </div>
            <div className="people" style={{ marginTop: 12 }}>{people.slice(0, 2).map(Card)}</div>
            {people.length > 2 && (
              <>
                <button className="btn on-grey" style={{ marginTop: 12 }} onClick={showMore} aria-expanded={more}>{loadingMore ? <Spinner size={18} /> : null}{more ? `Hide ${people.length - 2} more` : `Show ${people.length - 2} more ${people.length - 2 === 1 ? "person" : "people"}`}</button>
                {more && <div className="people" style={{ marginTop: 12 }}>{people.slice(2).map(Card)}</div>}
              </>
            )}

            {cur && (
              <section className="card" style={{ marginTop: 24, padding: 26 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0, flex: "1 1 260px" }}>
                    <h2 className="h2">Why message {cur.first}?</h2>
                    <p className="mute" style={{ margin: "6px 0 0", fontSize: 16, lineHeight: 1.5 }}>{cur.why || `${cur.title} at ${p.company}.`}</p>
                  </div>
                  <button className="btn" style={sent.includes(cur.id) ? { background: "#E7EFFA", color: "#164A88" } : { background: "var(--bg)" }} onClick={() => toggleSent(cur.id)} aria-pressed={sent.includes(cur.id)}>{sent.includes(cur.id) ? "✓ Sent" : "I sent it"}</button>
                </div>

                {!cur.written ? (
                  <div className="row" style={{ padding: "24px 0 0" }}><Spinner size={20} />Writing messages for {cur.first}…</div>
                ) : (
                  <>
                    <div style={{ marginTop: 26, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                      <span className="lbl">LinkedIn note, sent with a connection request</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: note.length > 200 ? "var(--red)" : "var(--mute)" }}>{note.length} / 200</span>
                    </div>
                    <label htmlFor="note" className="sr">LinkedIn note to {cur.first}</label>
                    <textarea id="note" className="ta" rows={4} style={{ marginTop: 10 }} value={note} onChange={(e) => setNotes({ ...notes, [cur.id]: e.target.value })} />
                    {note.length > 200 && <p style={{ margin: "6px 0 0", fontSize: 14, fontWeight: 600, color: "var(--red)" }}>LinkedIn only allows 200 characters in a note. Make it shorter before you copy it.</p>}
                    <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <button className="btn pri" onClick={() => (note.length > 200 ? toast.show("Make it 200 characters or less first") : copy(note, "Note copied"))}>Copy note</button>
                      {cur.profileUrl && <a className="btn sec" href={cur.profileUrl} target="_blank" rel="noopener">Open {cur.first}&apos;s profile{Icon.ext()}</a>}
                    </div>

                    <div style={{ marginTop: 30, paddingTop: 26, borderTop: "1px solid var(--line)" }}>
                      <span className="lbl">Email</span>
                      {cur.email ? (
                        <>
                          <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 18, fontWeight: 700, userSelect: "all" }}>{cur.email}</span>
                            <span className="tag" style={cur.emailFound ? { background: "var(--green-bg)", color: "#1A6B3C" } : { background: "#EEF1F5", color: "#5B6472" }}>{cur.emailFound ? "Found online" : "Our best guess, may bounce"}</span>
                            <button className="btn sec" style={{ minHeight: 36, fontSize: 14 }} onClick={() => copy(cur.email!, "Address copied")}>Copy address</button>
                          </div>
                          <div className="mute" style={{ marginTop: 14, fontSize: 14 }}>Subject</div>
                          <div style={{ marginTop: 4, fontSize: 16, fontWeight: 700 }}>{cur.subject}</div>
                          <label htmlFor="body" className="sr">Email to {cur.first}</label>
                          <textarea id="body" className="ta" rows={9} style={{ marginTop: 12 }} value={body} onChange={(e) => setBodies({ ...bodies, [cur.id]: e.target.value })} />
                          <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                            <a className="btn dark" target="_blank" rel="noopener" href={`https://mail.google.com/mail/?view=cm&to=${enc(cur.email)}&su=${enc(cur.subject || "")}&body=${enc(body)}`}>Open in Gmail</a>
                            <a className="btn sec" href={`mailto:${cur.email}?subject=${enc(cur.subject || "")}&body=${enc(body)}`}>Other mail app</a>
                            <button className="btn sec" onClick={() => copy(`Subject: ${cur.subject}\n\n${body}`, "Email copied")}>Copy email</button>
                          </div>
                          <p className="mute" style={{ margin: "10px 0 0", fontSize: 14 }}>Attach the PDF from &quot;Update your resume&quot; before you send it.</p>
                        </>
                      ) : (
                        <p className="mute" style={{ margin: "12px 0 0", fontSize: 16 }}>We couldn&apos;t find a work email for {cur.first}. Send the LinkedIn note instead.</p>
                      )}
                    </div>
                  </>
                )}
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
