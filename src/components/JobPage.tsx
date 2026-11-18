/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BackLink, Header, Icon, letterTile } from "./ui";
import { StatusMenu } from "./StatusMenu";
import { ProgressPopup } from "./ProgressPopup";
import { PROBLEMS } from "@/lib/status";

export function JobPage({ job, report, hasResume, initial }: { job: any; report: any; hasResume: boolean; initial: string }) {
  const router = useRouter();
  const [checkOpen, setCheckOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(job.apply_status);
  const [ask, setAsk] = useState(!!job.opened_posting_at && !job.apply_status);
  const working = job.status === "queued" || job.status === "scanning";
  const jd = report?.job_data || {};
  const co = report?.company_data || {};
  const big = report?.size_band === "big";
  const name = co.name || job.company || "this company";
  const t = letterTile(name);
  const people: any[] = report?.people || [];
  const resume = report?.resume;

  async function opened() {
    await fetch(`/api/jobs/${job.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ opened_posting: true }) });
    setTimeout(() => setAsk(true), 1500);
  }
  async function markApplied(yes: boolean) {
    setAsk(false);
    if (!yes) return;
    setStatus("applied");
    await fetch(`/api/jobs/${job.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ apply_status: "applied" }) });
  }

  if (working) return (<><Header signedIn initial={initial} /><main className="wrap" /><ProgressPopup jobId={job.id} onClose={() => router.push("/")} /></>);

  const problem = ["failed", "closed"].includes(job.status) ? PROBLEMS[job.error === "not_found" ? "not_found" : job.status] : null;
  if (problem) return (
    <>
      <Header signedIn initial={initial} />
      <main className="wrap">
        <BackLink href="/jobs">My jobs</BackLink>
        <div className="card" style={{ marginTop: 12, padding: 28 }}>
          <h1 className="h2">{problem.title}</h1>
          <p className="mute" style={{ fontSize: 16, lineHeight: 1.5 }}>{problem.text}</p>
          {problem.foot && <p style={{ fontSize: 14, color: "var(--green)", fontWeight: 600 }}>{problem.foot}</p>}
          <Link href="/" className="btn pri">Paste a different job</Link>
        </div>
      </main>
    </>
  );

  const fake = job.status === "fake";
  const agency = job.status === "agency" || report?.verdict === "agency";
  const warns = (report?.checks || []).filter((c: any) => c.result === "warn");
  const groups = ["The company", "Who posted the job", "The people we found"].map((g) => ({ g, items: (report?.checks || []).filter((c: any) => c.group === g) })).filter((x) => x.items.length);

  const steps = big
    ? [["Update your resume.", "Takes about 5 minutes."], ["Message 1 or 2 people today.", "Ask them to refer you. Don't apply yet."], ["No reply in 12 hours? Apply yourself.", "Use the same resume you sent them."]]
    : [["Update your resume.", "Takes about 5 minutes."], ["Apply today.", `Tap Apply on ${job.portal === "naukri" ? "Naukri" : "LinkedIn"} at the top.`], ["Then message people.", "Use the same resume you applied with."]];
  const resumeBlock = { href: `/jobs/${job.id}/resume`, icon: Icon.docEdit(28), bg: "var(--tile)", fg: "var(--ink)", title: "Update your resume", sub: hasResume ? `${resume?.skill_questions?.length ? `Answer ${resume.skill_questions.length} quick question${resume.skill_questions.length > 1 ? "s" : ""}, then download it` : "See the changes, then download it"}` : "Add your resume to see what to change" };
  const reachBlock = { href: `/jobs/${job.id}/reach-out`, icon: Icon.people(28), bg: "var(--tile)", fg: "var(--ink)", title: `Message people at ${name}`, sub: people.length ? `We found ${people.length}${people.filter((x: any) => x.email && x.emailFound).length ? `, ${people.filter((x: any) => x.email && x.emailFound).length} with a work email` : ""}. Start with ${Math.min(2, people.length)}.` : jd.hiringEmail ? "We couldn't find anyone public, but the job post has a hiring email." : "We couldn't find anyone public who works here, so there's no one to message.", off: !people.length && !jd.hiringEmail };
  const blocks = agency
    ? [{ ...resumeBlock, step: "Start here" }]
    : big
      ? [{ ...resumeBlock, step: "Step 1 · Start here" }, { ...reachBlock, step: "Step 2 · Before you apply" }]
      : [{ ...resumeBlock, step: "Step 1 · Start here" }, { ...reachBlock, step: "Step 3 · After you apply" }];

  return (
    <>
      <Header signedIn initial={initial} />
      <main className="wrap wide">
        <BackLink href="/jobs">My jobs</BackLink>

        {ask && !status && (
          <div className="card" style={{ marginTop: 8, padding: "14px 16px 14px 20px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", border: "1.5px solid var(--ink)" }}>
            <span style={{ flex: "1 1 240px", fontSize: 16, fontWeight: 600 }}>You opened this job on {job.portal === "naukri" ? "Naukri" : "LinkedIn"}. Did you apply?</span>
            <div style={{ display: "flex", gap: 8 }}><button className="btn dark" onClick={() => markApplied(true)}>Yes, I applied</button><button className="btn sec" onClick={() => markApplied(false)}>Not yet</button></div>
          </div>
        )}

        {fake && (
          <div className="card" style={{ marginTop: 12, padding: 24, background: "#FDECEF" }}>
            <h2 className="h2" style={{ color: "#B8132F" }}>{job.error === "no_people" ? "We couldn't confirm this company is real" : "This job might not be real"}</h2>
            <p style={{ fontSize: 16, lineHeight: 1.5, color: "#B8132F" }}>We couldn&apos;t confirm {name} is a real company, so we stopped before doing anything else. Here&apos;s what we noticed:</p>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 16, lineHeight: 1.6 }}>{warns.map((w: any, i: number) => <li key={i}>{w.text}</li>)}</ul>
            <p style={{ fontSize: 14, fontWeight: 600, color: "var(--green)" }}>Never pay to apply for a job. This didn&apos;t use one of your free searches.</p>
            <Link href="/" className="btn pri">Go back home</Link>
          </div>
        )}

        <div className="card" style={{ marginTop: 16, padding: 28 }}>
          <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
            <span className="tile" style={{ width: 72, height: 72, borderRadius: 24, background: t.bg, color: t.fg, fontWeight: 700, fontSize: 28 }}>{t.letters}</span>
            <div style={{ flex: "1 1 260px", minWidth: 0 }}>
              <h1 style={{ margin: 0, fontSize: "clamp(30px,4vw,36px)", lineHeight: 1.1, fontWeight: 700, letterSpacing: "-.03em", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{jd.title || job.title}</h1>
              <div className="mute" style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: "6px 16px", fontSize: 16 }}>
                {[`${name}${co.sizeText ? ` · ${co.sizeText}` : ""}`, jd.location, jd.postedText && `Posted ${String(jd.postedText).replace(/^posted\s*/i, "")}`, jd.applicantsText && `${jd.applicantsText} · as of ${new Date(report.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`].filter(Boolean).map((m, i) => <span key={i}>{m}</span>)}
              </div>
            </div>
          </div>
          <div style={{ marginTop: 22, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            {!fake && <a className="btn on-grey" href={jd.applyUrl || job.url} target="_blank" rel="noopener" onClick={opened}>Apply on {job.portal === "naukri" ? "Naukri" : "LinkedIn"}{Icon.ext()}</a>}
            <StatusMenu jobId={job.id} value={status} onChange={setStatus} alignLeft />
            <button className="btn" style={fake ? { background: "#FDECEF", color: "#B8132F" } : report?.verdict === "unverified" ? { background: "#EEF1F5", color: "var(--mute)" } : { background: "var(--green-bg)", color: "#1A6B3C" }} onClick={() => setCheckOpen(true)}>
              {Icon.shield(18)}{fake ? "May be fake" : report?.verdict === "unverified" ? "Couldn't fully check" : agency ? "Recruitment agency" : "Real company"}{Icon.chev(14)}
            </button>
          </div>
        </div>

        {!fake && (
          <>
            <section className="card task" style={{ marginTop: 28, padding: 24 }}>
              <h2 className="h2">{agency ? "A recruitment agency posted this job" : big ? "Message people first, then apply" : "Apply first, then message people"}</h2>
              <p className="mute" style={{ margin: "8px 0 0", fontSize: 16, lineHeight: 1.5 }}>
                {agency ? "They don't name the real company, so we can't find people who work there. You can still update your resume for it."
                  : big ? `${name} is a big company. At big companies, a referral usually only counts if you haven't applied yet, so ask first.`
                  : `${name} is a small company, and posts like this can close within a day. Apply now, then message people. Don't wait for replies.`}
              </p>
              {!agency && (
                <ol style={{ margin: "20px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 14 }}>
                  {steps.map(([a, b], i) => (
                    <li key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start", fontSize: 16, lineHeight: 1.5 }}>
                      <span style={{ width: 28, height: 28, flex: "none", borderRadius: 11, background: "var(--fill)", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 14 }}>{i + 1}</span>
                      <span><b>{a}</b> <span className="mute">{b}</span></span>
                    </li>
                  ))}
                </ol>
              )}
              {blocks[0] && (
                <Link href={blocks[0].href} className="btn lg outline" style={{ marginTop: 20 }}>Next: {blocks[0].title.charAt(0).toLowerCase() + blocks[0].title.slice(1)}{Icon.arrow()}</Link>
              )}
            </section>
            <div style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 12 }}>
              {blocks.map((b: any) => b.off ? (
                <div key={b.href} className="card" aria-disabled style={{ display: "flex", alignItems: "center", gap: 18, padding: 24, background: "var(--sunken)", color: "var(--mute)" }}>
                  <span className="tile" style={{ width: 56, height: 56, borderRadius: 20, background: "#EEF1F5", color: "var(--mute)" }}>{b.icon}</span>
                  <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                    <span className="lbl">{b.step} · Not available</span>
                    <span style={{ fontSize: 18, fontWeight: 700 }}>{b.title}</span>
                    <span style={{ fontSize: 16 }}>{b.sub}</span>
                  </span>
                </div>
              ) : (
                <Link key={b.href} href={b.href} className="card" style={{ display: "flex", alignItems: "center", gap: 18, padding: 24, textDecoration: "none" }}>
                  <span className="tile" style={{ width: 56, height: 56, borderRadius: 20, background: b.bg, color: b.fg }}>{b.icon}</span>
                  <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                    <span className="lbl">{b.step}</span>
                    <span style={{ fontSize: 18, fontWeight: 700 }}>{b.title}</span>
                    <span className="mute" style={{ fontSize: 16 }}>{b.sub}</span>
                  </span>
                  <span style={{ color: "#7F8897" }}>{Icon.chev(20)}</span>
                </Link>
              ))}
            </div>
          </>
        )}
      </main>

      {checkOpen && (
        <div className="ov" onClick={() => setCheckOpen(false)}>
          <div className="pop" role="dialog" aria-modal="true" aria-label={`How we checked ${name}`} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <h2 className="h2">How we checked {name}</h2>
              <button className="btn sec" style={{ minWidth: 44, padding: 0 }} aria-label="Close" onClick={() => setCheckOpen(false)}>{Icon.x()}</button>
            </div>
            {groups.map((g) => (
              <div key={g.g} style={{ marginTop: 22 }}>
                <div className="lbl">{g.g}</div>
                {g.items.map((c: any, i: number) => (
                  <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 10, fontSize: 16, lineHeight: 1.45 }}>
                    <span style={{ width: 22, height: 22, flex: "none", borderRadius: 8, display: "grid", placeItems: "center", fontWeight: 700, fontSize: 14, background: c.result === "pass" ? "var(--green-bg)" : c.result === "warn" ? "#EEF1F5" : "#EEF1F5", color: c.result === "pass" ? "var(--green)" : c.result === "warn" ? "#5B6472" : "var(--mute)" }}>{c.result === "pass" ? "✓" : c.result === "warn" ? "!" : "?"}</span>
                    <span>{c.text}</span>
                  </div>
                ))}
              </div>
            ))}
            <p className="mute" style={{ margin: "22px 0 0", fontSize: 14 }}>If we can&apos;t check something, we tell you instead of guessing. Names and roles come from public LinkedIn profiles.</p>
          </div>
        </div>
      )}
    </>
  );
}
