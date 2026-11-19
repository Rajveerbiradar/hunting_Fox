"use client";
import { useState } from "react";
import { PdfButton } from "./PdfButton";
import { Header, Icon, copyText, letterTile, useToast } from "./ui";
import type { JobData, Person } from "@/lib/pipeline/types";
import { relevantSkills } from "@/lib/skillMatch";

const enc = encodeURIComponent;

/** The people we found at the company: who they are, why they're worth contacting, their LinkedIn and any work email.
 *  We don't write messages: the student writes their own. */
export function ReachOut(p: { jobId: string; company: string; big: boolean; people: Person[]; hiringEmail?: string; sentTo: string[]; initial: string; hasResume?: boolean; personalised?: boolean; mine?: string[]; resumeText?: string; asked?: string[]; job?: Partial<JobData> | null }) {
  const people = p.people;
  const [sel, setSel] = useState(people[0]?.id);
  const [sent, setSent] = useState<string[]>(p.sentTo);
  const toast = useToast();
  const cur = people.find((x) => x.id === sel);
  const hasEmail = (x: Person) => !!(x.email && x.emailFound);
  // Skills: the ones the student already has (confirmed in their skills, or written on their resume) are marked;
  // the rest can be sent to this job's resume page, where the student says how well they know it.
  const mine = new Set((p.mine || []).map((x) => x.toLowerCase()));
  const resumeLow = (p.resumeText || "").toLowerCase();
  const has = (sk: string) => mine.has(sk.toLowerCase()) || (sk.length > 2 && resumeLow.includes(sk.toLowerCase()));
  const [added, setAdded] = useState<string[]>((p.asked || []).map((x) => x.toLowerCase()));
  // Only skills that matter for THIS job: named in the job post, or held by people in a similar role (skillMatch.ts).
  const rel = relevantSkills(people, p.job);
  const common = rel.skills;
  async function addSkill(sk: string, from?: string) {
    setAdded((a) => [...a, sk.toLowerCase()]);
    const r = await fetch(`/api/jobs/${p.jobId}/resume-plan`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "add_skill", skill: sk, from }) }).catch(() => null);
    if (!r || !r.ok) { setAdded((a) => a.filter((x) => x !== sk.toLowerCase())); toast.show("Couldn't add it. Try again."); return; }
    toast.show(`${sk} is on your resume page now. Say how well you know it there.`);
  }
  const Chip = ({ sk, n, from, info }: { sk: string; n?: number; from?: string; info?: boolean }) => {
    const own = has(sk); const on = added.includes(sk.toLowerCase());
    if (info && !own) return <span className="tag" style={{ background: "var(--tile)", color: "var(--mute)" }}>{sk}</span>;
    return (
      <span className="tag" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 6px 4px 10px", background: own ? "#e5f3e9" : "var(--tile)", color: own ? "#1a6b3c" : "var(--ink)", fontWeight: 600 }}>
        {own && "✓ "}{sk}{rel.inPost(sk) && !own ? <span style={{ fontSize: 11, fontWeight: 700, color: "#164a88" }}>IN THE JOB POST</span> : null}{n && n > 1 ? <span className="mute" style={{ fontWeight: 400 }}>· {n}</span> : null}
        {!own && (on
          ? <span style={{ fontSize: 12, color: "#164a88", padding: "0 6px" }}>Added</span>
          : <button onClick={() => addSkill(sk, from)} aria-label={`I have ${sk}: add it to my resume page`} style={{ border: 0, background: "#fff", borderRadius: 999, fontSize: 12, fontWeight: 700, padding: "3px 8px", cursor: "pointer" }}>+ I have this</button>)}
        {own && <span style={{ width: 4 }} />}
      </span>
    );
  };

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
            {common.length > 0 && (
              <section id="skills" className="card" style={{ marginTop: 24, padding: 24 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Skills people at {p.company} list</h2>
                <p className="mute" style={{ margin: "6px 0 14px", fontSize: 16, lineHeight: 1.5 }}>Only skills that matter for this job: ones the job post asks for, and ones listed by people here who do similar work. <b style={{ color: "#1a6b3c" }}>Green</b> ones are already on your resume. If you really have another one, tap <b>I have this</b> and it goes to your resume page for {p.company}. Sharing their skills helps you match them, but only add what you&apos;ve actually used.</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{common.map((c) => <Chip key={c.name} sk={c.name} n={c.n} />)}</div>
                <a className="btn sec" style={{ marginTop: 16, minHeight: 36, fontSize: 14 }} href={`/jobs/${p.jobId}/resume`}>Go to my resume for {p.company}</a>
              </section>
            )}

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
                {(cur.skills || []).length > 0 && (() => {
                  const near = rel.relevantPeople.has(cur.id);
                  return (
                    <div style={{ marginTop: 18 }}>
                      <div className="lbl">{cur.first}&apos;s skills · {cur.title}</div>
                      {!near && <p className="mute" style={{ margin: "6px 0 0", fontSize: 14, lineHeight: 1.45 }}>{cur.first} does a different kind of work from this job, so most of these won&apos;t help your resume here. Only ones the job post asks for can be added.</p>}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>{[...new Set(cur.skills.map((k) => k.trim()).filter(Boolean))].slice(0, 20).map((k) => <Chip key={k} sk={k} from={cur.first} info={!near && !rel.inPost(k)} />)}</div>
                    </div>
                  );
                })()}

                <div style={{ marginTop: 16, background: "var(--sunken)", borderRadius: 16, padding: "14px 16px", fontSize: 14, lineHeight: 1.5 }}>
                  <b style={{ display: "block", fontSize: 16 }}>Attach your resume when you write</b>
                  {!p.hasResume ? (
                    <span className="mute">You haven&apos;t added a resume yet. <a href="/account" style={{ color: "var(--ink)", fontWeight: 600 }}>Add it on your account page</a>.</span>
                  ) : p.personalised ? (
                    <span className="mute">This is your resume made for {p.company}, with the changes you applied.</span>
                  ) : (
                    <span className="mute">This is your main resume. It isn&apos;t made for {p.company} yet. <a href={`/jobs/${p.jobId}/resume`} style={{ color: "var(--ink)", fontWeight: 600 }}>Make it for {p.company}</a> first, so it speaks this job&apos;s language.</span>
                  )}
                  {p.hasResume && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                      <PdfButton source={`/api/jobs/${p.jobId}/resume-lines`} className="btn sec" style={{ minHeight: 36, fontSize: 14 }}>{p.personalised ? `Download the PDF for ${p.company}` : "Download my main resume"}</PdfButton>
                      {!p.personalised && <a className="btn sec" style={{ minHeight: 36, fontSize: 14 }} href={`/jobs/${p.jobId}/resume`}>Make it for {p.company}</a>}
                    </div>
                  )}
                </div>
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
