"use client";
import { useEffect, useRef, useState } from "react";
import { BackLink, Header, Icon, Spinner, copyText, letterTile, useToast } from "./ui";
import type { Person } from "@/lib/pipeline/types";

const enc = encodeURIComponent;

export function ReachOut(p: { jobId: string; company: string; big: boolean; people: Person[]; hiringEmail?: string; sentTo: string[]; initial: string; missingName: boolean; finishedAt?: string | null }) {
  const [people, setPeople] = useState(p.people);
  const [sel, setSel] = useState(people[0]?.id);
  const [rewriting, setRewriting] = useState<string | null>(null);
  const pendingCount = people.filter((x) => !x.written).length;
  const nudged = useRef(false);

  // Messages are written in the background, everyone at once. Poll until all are in;
  // each card fills in the moment its message is saved. If nothing new arrives for 75s, ask the server to finish the rest.
  useEffect(() => {
    if (!pendingCount) return;
    let alive = true, last = Date.now(), lastDone = people.length - pendingCount;
    const tick = async () => {
      const r = await fetch(`/api/jobs/${p.jobId}`, { cache: "no-store" }).catch(() => null);
      const d = r && r.ok ? await r.json().catch(() => null) : null;
      if (!alive) return;
      const fresh: Person[] | undefined = d?.report?.people;
      if (fresh?.length) {
        setPeople((cur) => fresh.map((f) => (f.written ? f : cur.find((c) => c.id === f.id) || f)));
        const done = fresh.filter((x) => x.written).length;
        if (done > lastDone) { lastDone = done; last = Date.now(); }
        if (done === fresh.length) return;
      }
      // Old job, or the background writing stopped: finish the rest now.
      const stale = p.finishedAt && Date.now() - new Date(p.finishedAt).getTime() > 240_000;
      if ((stale || Date.now() - last > 75_000) && !nudged.current) {
        nudged.current = true;
        fetch(`/api/jobs/${p.jobId}/more`, { method: "POST" }).catch(() => null);
      }
      setTimeout(tick, 2000);
    };
    const t = setTimeout(tick, 1500);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.jobId, pendingCount > 0]);

  async function rewrite(id: string) {
    setRewriting(id);
    const r = await fetch(`/api/jobs/${p.jobId}/more`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids: [id] }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    if (d.people) { setPeople(d.people); setNotes((n) => { const c = { ...n }; delete c[id]; return c; }); setBodies((b) => { const c = { ...b }; delete c[id]; return c; }); }
    setRewriting(null);
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
          {!x.written && <span className="tag" style={{ background: "#EEF1F5", color: "var(--mute)", gap: 6 }}><Spinner size={12} />Writing</span>}
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
            <div style={{ marginTop: 28, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <span className="lbl">Best first · start with the top 2</span>
              {pendingCount > 0 && <span className="mute" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14 }}><Spinner size={16} />{people.length - pendingCount} of {people.length} messages ready</span>}
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

                {!cur.written || rewriting === cur.id ? (
                  <div className="row" style={{ padding: "24px 0 0" }}><Spinner size={20} />Writing {cur.first}&apos;s messages from their profile…</div>
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
                      <button className="btn ghost" onClick={() => rewrite(cur.id)}>Write it again</button>
                    </div>

                    <div style={{ marginTop: 30, paddingTop: 26, borderTop: "1px solid var(--line)" }}>
                      <span className="lbl">Email</span>
                      {cur.email ? (
                        <>
                          <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 18, fontWeight: 700, userSelect: "all" }}>{cur.email}</span>
                            <span className="tag" style={cur.emailFound ? { background: "var(--green-bg)", color: "#1A6B3C" } : { background: "#EEF1F5", color: "#5B6472" }}>{cur.emailFound ? `Their work email at ${p.company}` : "Our best guess, may bounce"}</span>
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
                          <p style={{ margin: "12px 0 0", fontSize: 14, lineHeight: 1.5, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}><b>Attach your resume PDF before you send.</b><span className="mute">The email says it&apos;s attached.</span><a href={`/jobs/${p.jobId}/resume/print`} target="_blank" rel="noopener" style={{ fontWeight: 600 }}>Download the PDF for {p.company}</a></p>
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
