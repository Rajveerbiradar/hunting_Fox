"use client";
import { useState } from "react";
import { PdfButton } from "./PdfButton";
import { BackLink, Header, Icon, Spinner, copyText, letterTile, useToast } from "./ui";
import type { Person } from "@/lib/pipeline/types";

const enc = encodeURIComponent;

export function ReachOut(p: { jobId: string; company: string; big: boolean; people: Person[]; hiringEmail?: string; sentTo: string[]; initial: string; missingName: boolean; finishedAt?: string | null }) {
  const [people, setPeople] = useState(p.people);
  const [sel, setSel] = useState(people[0]?.id);
  const [writing, setWriting] = useState<string | null>(null);
  const [composing, setComposing] = useState<Record<string, boolean>>({});
  const [asks, setAsks] = useState<Record<string, string>>(() => Object.fromEntries(p.people.filter((x) => x.asked).map((x) => [x.id, x.asked!])));
  const MIN = 60, MAX = 600;

  // Nothing is written up front. The student picks a person, then either writes a few rough lines
  // ("Write my email") or asks for our suggested message. One person at a time, on request.
  async function write(id: string, withNotes: boolean) {
    const text = (asks[id] || "").trim();
    if (withNotes && text.length < MIN) return;
    setWriting(id);
    const r = await fetch(`/api/jobs/${p.jobId}/more`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids: [id], notes: withNotes ? text : "" }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    if (d.people) {
      setPeople(d.people);
      setComposing((c) => ({ ...c, [id]: false }));
      setNotes((n) => { const c = { ...n }; delete c[id]; return c; });
      setBodies((b2) => { const c = { ...b2 }; delete c[id]; return c; });
    } else toast.show("Couldn't write it just now. Try again in a minute.");
    setWriting(null);
  }
  const [sent, setSent] = useState<string[]>(p.sentTo);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [bodies, setBodies] = useState<Record<string, string>>({});
  const toast = useToast();

  const cur = people.find((x) => x.id === sel);
  const note = cur ? notes[cur.id] ?? cur.note ?? "" : "";
  const body = cur ? bodies[cur.id] ?? cur.body ?? "" : "";

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
          {x.email && x.emailFound && <span className="tag" style={{ background: "var(--green-bg)", color: "#1A6B3C" }}>✓ Work email</span>}
          {writing === x.id ? <span className="tag" style={{ background: "#EEF1F5", color: "var(--mute)", gap: 6 }}><Spinner size={12} />Writing</span> : x.written ? <span className="tag" style={{ background: "#EEF1F5", color: "var(--ink)" }}>Message ready</span> : null}
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
          {p.big ? "Message people before you apply. Politely ask for a referral; if no one replies in 12 hours, apply yourself." : "Message people after you apply. Ask for their help in finding the right person, which works better than asking a stranger for a referral."} Pick a person, say what you want to tell them in your own words, and we&apos;ll turn it into a proper message.
        </p>

        {people.length === 0 ? (
          <div className="card" style={{ marginTop: 24, padding: 26 }}>
            <h2 className="h2" style={{ fontSize: 18 }}>We couldn&apos;t find anyone who works here</h2>
            <p className="mute" style={{ fontSize: 16, lineHeight: 1.5 }}>Nobody at {p.company} has a public LinkedIn profile we could find. You can still apply directly.{p.hiringEmail ? ` We did find their hiring email: ${p.hiringEmail}.` : ""}</p>
          </div>
        ) : (
          <>
            <div style={{ marginTop: 28, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <span className="lbl">Best first · start with the top 2</span>
            </div>
            <div className="people" style={{ marginTop: 12 }}>{people.map(Card)}</div>

            {cur && (
              <section className="card" style={{ marginTop: 24, padding: 26 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0, flex: "1 1 260px" }}>
                    <h2 className="h2">Why message {cur.first}?</h2>
                    <p className="mute" style={{ margin: "6px 0 0", fontSize: 16, lineHeight: 1.5 }}>{cur.why || `${cur.title} at ${p.company}.`}</p>
                  </div>
                  <button className="btn" style={sent.includes(cur.id) ? { background: "#E7EFFA", color: "#164A88" } : { background: "var(--bg)" }} onClick={() => toggleSent(cur.id)} aria-pressed={sent.includes(cur.id)}>{sent.includes(cur.id) ? "✓ Sent" : "I sent it"}</button>
                </div>

                <div style={{ marginTop: 18, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                  {cur.profileUrl && <a className="btn sec" href={cur.profileUrl} target="_blank" rel="noopener">View {cur.first} on LinkedIn{Icon.ext()}</a>}
                  {cur.email && cur.emailFound ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span className="tag" style={{ background: "var(--green-bg)", color: "#1A6B3C" }}>✓ Work email</span>
                      <span style={{ fontSize: 16, fontWeight: 700, userSelect: "all", wordBreak: "break-all" }}>{cur.email}</span>
                      <button className="btn sec" style={{ minHeight: 36, fontSize: 14 }} onClick={() => copy(cur.email!, "Address copied")}>Copy</button>
                    </span>
                  ) : <span className="mute" style={{ fontSize: 14 }}>No work email found. Use the LinkedIn note.</span>}
                </div>
                {cur.profileUrl && <p className="mute" style={{ margin: "8px 0 0", fontSize: 14 }}>If their profile looks hidden to you, the LinkedIn link still opens it once you&apos;re signed in.</p>}

                {writing === cur.id ? (
                  <div className="row" style={{ padding: "26px 0 0" }}><Spinner size={20} />Writing {cur.first}&apos;s note and email…</div>
                ) : !cur.written || composing[cur.id] ? (
                  <div style={{ marginTop: 26, paddingTop: 22, borderTop: "1px solid var(--line)" }}>
                    <label htmlFor="ask" className="lbl" style={{ display: "block" }}>What do you want to tell {cur.first}?</label>
                    <textarea id="ask" className="ta" rows={4} maxLength={MAX} style={{ marginTop: 10 }} value={asks[cur.id] || ""} onChange={(e) => setAsks({ ...asks, [cur.id]: e.target.value })}
                      placeholder="Write it your way, in a few rough lines. We'll turn it into a well-written, professional email." />
                    <div className="mute" style={{ marginTop: 6, fontSize: 14, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <span>{(asks[cur.id] || "").trim().length < MIN ? `Write at least ${MIN - (asks[cur.id] || "").trim().length} more characters, about 10 words, so we have enough to work with.` : "Good. We'll keep your points and your ask."}</span>
                      <span>{(asks[cur.id] || "").length} / {MAX}</span>
                    </div>
                    <div style={{ marginTop: 14, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 10 }}>
                      <button className={(asks[cur.id] || "").trim().length >= MIN ? "btn lg pri" : "btn lg off"} disabled={(asks[cur.id] || "").trim().length < MIN} onClick={() => write(cur.id, true)}>Write my email</button>
                      <button className="btn outline" onClick={() => write(cur.id, false)}>Use our suggested email</button>
                      <span className="mute" style={{ fontSize: 14 }}>Our suggested email is still written for {cur.first}, from their profile and your resume.</span>
                    </div>
                    {cur.written && <button className="btn ghost" style={{ marginTop: 6 }} onClick={() => setComposing({ ...composing, [cur.id]: false })}>Keep the current message</button>}
                  </div>
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
                      <button className="btn dark" onClick={() => (note.length > 200 ? toast.show("Make it 200 characters or less first") : copy(note, "Note copied"))}>Copy note</button>
                      <button className="btn ghost" onClick={() => setComposing({ ...composing, [cur.id]: true })}>Write it again</button>
                    </div>

                    <div style={{ marginTop: 30, paddingTop: 26, borderTop: "1px solid var(--line)" }}>
                      <span className="lbl">Email</span>
                      {cur.email ? (
                        <>
                          <div className="mute" style={{ marginTop: 12, fontSize: 14 }}>To <b style={{ color: "var(--ink)" }}>{cur.email}</b></div>
                          <div className="mute" style={{ marginTop: 14, fontSize: 14 }}>Subject</div>
                          <div style={{ marginTop: 4, fontSize: 16, fontWeight: 700 }}>{cur.subject}</div>
                          <label htmlFor="body" className="sr">Email to {cur.first}</label>
                          <textarea id="body" className="ta" rows={9} style={{ marginTop: 12 }} value={body} onChange={(e) => setBodies({ ...bodies, [cur.id]: e.target.value })} />
                          <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                            <a className="btn dark" target="_blank" rel="noopener" href={`https://mail.google.com/mail/?view=cm&to=${enc(cur.email)}&su=${enc(cur.subject || "")}&body=${enc(body)}`}>Open in Gmail</a>
                            <a className="btn sec" href={`mailto:${cur.email}?subject=${enc(cur.subject || "")}&body=${enc(body)}`}>Other mail app</a>
                            <button className="btn sec" onClick={() => copy(`Subject: ${cur.subject}\n\n${body}`, "Email copied")}>Copy email</button>
                          </div>
                          <p style={{ margin: "12px 0 0", fontSize: 14, lineHeight: 1.5, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}><b>Attach your resume PDF before you send.</b><span className="mute">The email says it&apos;s attached.</span><PdfButton source={`/api/jobs/${p.jobId}/resume-lines`} className="btn sec" style={{ minHeight: 36, fontSize: 14 }}>Download the PDF for {p.company}</PdfButton></p>
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
