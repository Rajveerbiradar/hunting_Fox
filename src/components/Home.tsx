"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Header, Icon, Spinner, letterTile } from "./ui";
import { LinkBox } from "./LinkBox";
import { ProgressPopup } from "./ProgressPopup";
import { ResumeUpload } from "./ResumeUpload";

type Job = { id: string; title: string | null; company: string | null; status: string; apply_status: string | null; applied_at: string | null; created_at: string };

const UPDATE_OPTS: Record<string, { key: string; label: string }[]> = {
  default: [{ key: "replied", label: "They replied" }, { key: "interview", label: "Got an interview" }, { key: "got_job", label: "Got the job" }, { key: "not_selected", label: "Didn't get it" }],
  replied: [{ key: "interview", label: "Got an interview" }, { key: "got_job", label: "Got the job" }, { key: "not_selected", label: "Didn't get it" }],
};

function ago(iso?: string | null) {
  if (!iso) return "";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
}

export function Home(p: { signedIn: boolean; initialLink?: string; name?: string; email?: string; resumeName?: string; jobs?: Job[]; left?: number; limit?: number; approved?: boolean; admin?: boolean }) {
  const router = useRouter();
  const [scanId, setScanId] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [stopped, setStopped] = useState(false);
  const jobs = p.jobs || [];
  const applied = jobs.filter((j) => j.apply_status && ["applied", "no_reply", "replied"].includes(j.apply_status));
  const returning = p.signedIn && jobs.some((j) => j.apply_status);
  const first = (p.name || "").split(/[\s@]/)[0];

  // Coming back from sign-in with a link: start it straight away.
  useEffect(() => {
    if (!p.signedIn || !p.initialLink || !p.approved) return;
    (async () => {
      const r = await fetch("/api/jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ link: p.initialLink }) });
      const d = await r.json().catch(() => ({}));
      router.replace("/");
      if (r.ok && d.duplicate) router.push(`/jobs/${d.id}`);
      else if (r.ok) setScanId(d.id);
    })();
  }, [p.signedIn, p.initialLink, p.approved, router]);

  async function setStatus(id: string, key: string) {
    setPicked((x) => ({ ...x, [id]: key }));
    await fetch(`/api/jobs/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ apply_status: key }) });
  }

  return (
    <>
      <Header signedIn={p.signedIn} initial={first[0]} showJobs={returning} admin={p.admin} />
      <main className="wrap">
        {returning ? (
          <h1 className="h1">Welcome back{first ? `, ${first}` : ""}</h1>
        ) : (
          <>
            <h1 className="h1">Paste a job you want. We&apos;ll help you get in.</h1>
            <p className="mute" style={{ margin: "14px 0 0", fontSize: 18, lineHeight: 1.55, maxWidth: "52ch" }}>
              We show you what to change in your resume for that job, who works there, and what to send them, so your application actually gets seen.
            </p>
          </>
        )}

        {p.signedIn && !p.approved && (
          <div className="card" style={{ marginTop: 28, padding: "18px 20px", display: "flex", gap: 14, alignItems: "flex-start", background: "#FFF4E5", color: "#7A4A00" }}>
            <span style={{ flex: "none", marginTop: 2 }}>{Icon.info(22)}</span>
            <div style={{ fontSize: 15, lineHeight: 1.5 }}>
              <b style={{ fontSize: 16 }}>You&apos;re on the waiting list.</b><br />
              Hunting Fox is free while we test it, so Rajveer approves every student by hand. You can paste a job now, and it&apos;ll work as soon as you&apos;re approved.
            </div>
          </div>
        )}

        <LinkBox signedIn={p.signedIn} initial={!p.signedIn || !p.approved ? p.initialLink : ""} onStarted={(id) => setScanId(id)} />

        {p.signedIn && !p.approved ? null : p.signedIn && p.resumeName ? (
          <div className="mute" style={{ margin: "4px 8px 0", display: "flex", alignItems: "center", gap: 8, fontSize: 14, flexWrap: "wrap" }}>
            <span style={{ color: "var(--green)" }}>{Icon.check(16)}</span>Using {p.resumeName} · <Link href="/account" style={{ color: "var(--pink)", fontWeight: 700, textDecoration: "none", padding: "10px 2px" }}>Change</Link> · {p.left} of {p.limit} searches left
          </div>
        ) : (
          <ResumeUpload signedIn={p.signedIn} compact />
        )}

        {returning && applied.length > 0 && (
          <section style={{ marginTop: 56 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, margin: "0 8px" }}>
              <h2 className="h2">Any news from these jobs?</h2>
              <span className="mute" style={{ fontSize: 14 }}>{applied.filter((j) => !picked[j.id]).length || "All"} {applied.filter((j) => !picked[j.id]).length ? "to update" : "updated"}</span>
            </div>
            <p className="mute" style={{ margin: "6px 8px 0", fontSize: 15 }}>Tell us what happened, and we&apos;ll remind you to follow up at the right time.</p>
            <div className="card" style={{ marginTop: 16, overflow: "hidden" }}>
              {applied.slice(0, 3).map((j, i) => {
                const t = letterTile(j.company || "?");
                const pk = picked[j.id];
                const opts = UPDATE_OPTS[j.apply_status === "replied" ? "replied" : "default"];
                return (
                  <div key={j.id} style={{ padding: "18px 20px", borderTop: i ? "1px solid var(--line)" : undefined }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <span className="tile" style={{ width: 46, height: 46, background: t.bg, color: t.fg, fontWeight: 800 }}>{t.letters}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 17, fontWeight: 700 }}>{j.company}</div>
                        <div className="mute" style={{ fontSize: 14, marginTop: 2 }}>{j.title} · {j.apply_status === "replied" ? "they replied" : `you applied ${ago(j.applied_at)}${j.apply_status === "no_reply" ? ", no reply yet" : ""}`}</div>
                      </div>
                      {pk && <span style={{ display: "inline-flex", gap: 6, fontSize: 14, fontWeight: 700, color: "var(--green)" }}>{Icon.check(18)}{opts.find((o) => o.key === pk)?.label}</span>}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
                      {opts.map((o) => (
                        <button key={o.key} className="opt" role="radio" aria-checked={pk === o.key} onClick={() => setStatus(j.id, o.key)}>{o.label}</button>
                      ))}
                      {j.apply_status === "no_reply" && !pk && <Link href={`/jobs/${j.id}/reach-out`} className="btn dark" style={{ minHeight: 40, fontSize: 14 }}>Send a follow-up</Link>}
                    </div>
                    {pk === "got_job" && (
                      <div style={{ marginTop: 14, padding: "16px 18px", background: "var(--green-bg)", borderRadius: 20, cornerShape: "squircle", color: "#155C35" } as React.CSSProperties}>
                        <div style={{ fontSize: 17, fontWeight: 800 }}>Congratulations{first ? `, ${first}` : ""}!</div>
                        <div style={{ fontSize: 15, marginTop: 4 }}>Want us to stop reminding you about your other jobs?</div>
                        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                          <button className="btn" style={{ background: "#155C35", color: "#fff", minHeight: 40 }} onClick={() => setStopped(true)}>{stopped ? "✓ Reminders stopped" : "Yes, stop reminders"}</button>
                          <button className="btn" style={{ background: "#fff", color: "#155C35", minHeight: 40 }}>No, keep them</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {applied.length > 3 && (
                <Link href="/jobs" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderTop: "1px solid var(--line)", textDecoration: "none", fontSize: 15, fontWeight: 700, color: "var(--pink)" }}>See all {applied.length} jobs you applied to{Icon.chev()}</Link>
              )}
            </div>
          </section>
        )}

        {p.signedIn && jobs.length > 0 && (
          <section style={{ marginTop: 48 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, margin: "0 8px" }}>
              <h2 className="h2">Recently added</h2>
              <Link href="/jobs" style={{ fontSize: 15, fontWeight: 700, textDecoration: "none", color: "var(--pink)" }}>See all</Link>
            </div>
            <div className="card" style={{ marginTop: 16, overflow: "hidden" }}>
              {jobs.slice(0, 3).map((j, i) => {
                const t = letterTile(j.company || "?");
                const working = j.status === "queued" || j.status === "scanning";
                return (
                  <Link key={j.id} href={`/jobs/${j.id}`} style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 20px", textDecoration: "none", borderTop: i ? "1px solid var(--line)" : undefined }}>
                    <span className="tile" style={{ width: 46, height: 46, background: t.bg, color: t.fg, fontWeight: 800 }}>{t.letters}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 17, fontWeight: 700 }}>{j.company || "Looking into it"}</span>
                      <span className="mute" style={{ display: "block", fontSize: 14, marginTop: 2 }}>{j.title || "Reading the job"} · {working ? "still working on it" : j.status === "ready" ? "ready" : "see what happened"}</span>
                    </span>
                    {working ? <Spinner size={20} label="Still working" /> : <span style={{ color: "#C7C7CC" }}>{Icon.chev()}</span>}
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {!returning && (
          <>
            <div className="lbl" style={{ marginTop: 88, textAlign: "center" }}>What you get for each job you paste</div>
            <div className="three" style={{ marginTop: 28 }}>
              {[
                [Icon.docEdit(40), "Your resume, changed for that job", "We show you exactly what to change. We only add skills you tell us you have."],
                [Icon.people(40), "People who work there", "From public LinkedIn profiles, with the people most likely to reply first."],
                [Icon.mail(40), "Messages ready to send", "A short LinkedIn note and an email for each person. You send them yourself."],
              ].map(([icon, t, d], i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center" }}>
                  <span style={{ color: "var(--pink)" }}>{icon}</span>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>{t}</span>
                  <span className="mute" style={{ fontSize: 14, lineHeight: 1.5, maxWidth: "28ch" }}>{d}</span>
                </div>
              ))}
            </div>
            <p style={{ margin: "40px 0 0", textAlign: "center", fontSize: 15, fontWeight: 600 }}>Free while we test it. We approve every student by hand, then give you your searches.</p>
            <div className="mute" style={{ marginTop: 72, display: "flex", justifyContent: "center", alignItems: "center", gap: 10, fontSize: 14, textAlign: "center", flexWrap: "wrap" }}>
              <span style={{ color: "var(--green)" }}>{Icon.shield()}</span>
              <span>We check every company first, so you don&apos;t waste time on fake jobs. We never send anything for you.</span>
              <Link href="/remove-info">Remove my info</Link>
            </div>
          </>
        )}
      </main>
      {scanId && <ProgressPopup jobId={scanId} email={p.email} onClose={() => { setScanId(null); router.refresh(); }} />}
    </>
  );
}
