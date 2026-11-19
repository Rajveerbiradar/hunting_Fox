"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Header, Icon, LiveStep, Spinner, announceJob, letterTile, useLiveJobs } from "./ui";
import { AskMore } from "./AskMore";
import { ContactRows } from "./Contact";
import { statusOf } from "@/lib/status";
import { LinkBox } from "./LinkBox";
import { ProgressPopup } from "./ProgressPopup";
import { ResumeUpload } from "./ResumeUpload";
import { WaitingScreen } from "./WaitingScreen";

type Job = { id: string; title: string | null; company: string | null; status: string; step?: number | null; apply_status: string | null; applied_at: string | null; created_at: string };

// Three likely answers first; the rest behind "More".
const ALL_OPTS = [{ key: "replied", label: "They replied" }, { key: "interview", label: "Got an interview" }, { key: "got_job", label: "Got the job" }, { key: "not_selected", label: "Didn't get it" }, { key: "not_applying", label: "Not applying" }];
const LIKELY: Record<string, string[]> = { applied: ["replied", "interview", "not_selected"], no_reply: ["replied", "interview", "not_applying"], replied: ["interview", "got_job", "not_selected"] };
const GOOD_NEWS = ["replied", "interview", "got_job"];

function ago(iso?: string | null) {
  if (!iso) return "";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
}

export function Home(p: { signedIn: boolean; initialLink?: string; name?: string; email?: string; resumeName?: string; jobs?: Job[]; left?: number; limit?: number; used?: number; ownApify?: boolean; approved?: boolean; admin?: boolean; declineMessage?: string | null; ai?: { pct: number; low: boolean; done: boolean } }) {
  const router = useRouter();
  const [scanId, setScanId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [stopped, setStopped] = useState(false);
  const [more, setMore] = useState<Record<string, boolean>>({});
  const [restored, setRestored] = useState("");

  // A link pasted while waiting for approval comes back into the box once approved.
  useEffect(() => {
    if (!p.signedIn || !p.approved) return;
    try {
      const l = localStorage.getItem("hf_pending_link");
      if (l) { setRestored(l); localStorage.removeItem("hf_pending_link"); }
    } catch { /* storage blocked */ }
  }, [p.signedIn, p.approved]);
  const [jobs] = useLiveJobs(p.jobs || []);
  const applied = jobs.filter((j) => j.apply_status && ["applied", "no_reply", "replied"].includes(j.apply_status));
  const returning = p.signedIn && jobs.some((j) => j.apply_status);
  const first = (p.name || "").split(/[\s@]/)[0];

  // Coming back from sign-in with a link: start it straight away.
  useEffect(() => {
    if (!p.signedIn || !p.initialLink || !p.approved) return;
    setStarting(true);
    (async () => {
      const r = await fetch("/api/jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ link: p.initialLink }) }).catch(() => null);
      const d = r ? await r.json().catch(() => ({})) : {};
      router.replace("/");
      if (r?.ok && d.duplicate) { setStarting(false); router.push(`/jobs/${d.id}`); }
      else if (r?.ok) { setScanId(d.id); announceJob(); }
      else setStarting(false);
    })();
  }, [p.signedIn, p.initialLink, p.approved, router]);

  async function setStatus(id: string, key: string) {
    setPicked((x) => ({ ...x, [id]: key }));
    await fetch(`/api/jobs/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ apply_status: key }) });
  }

  if (p.signedIn && !p.approved) return (
    <>
      <Header signedIn initial={first[0]} showJobs={false} />
      <WaitingScreen email={p.email || ""} pendingLink={p.initialLink} declineMessage={p.declineMessage} />
    </>
  );

  return (
    <>
      <Header signedIn={p.signedIn} initial={first[0]} showJobs={p.signedIn} admin={p.admin} />
      <main className="wrap">
        {returning ? (
          <h1 className="h1">Welcome back{first ? `, ${first}` : ""}</h1>
        ) : (
          <>
            <h1 className="display">Paste a job you want. We&apos;ll help you get in.</h1>
            <p className="mute" style={{ margin: "14px 0 0", fontSize: 18, lineHeight: 1.55, maxWidth: "52ch" }}>
              We show you what to change in your resume for that job, who works there, and what to send them, so your application actually gets seen.
            </p>
          </>
        )}

        {p.approved && (p.ai?.low || p.ai?.done) && (
          <div className="card" role="status" style={{ marginTop: 16, padding: "14px 18px", fontSize: 15, lineHeight: 1.5, ...(p.ai.done ? { background: "#FDECEF", color: "#B8132F" } : { background: "#FFEFB0", color: "#4F3E00" }) }}>
            {p.ai.done
              ? <><b>The AI budget allocated to you is finished.</b> AI credits are separate from your search credits. Hunting Fox is a personal project with a limited budget, so please ask the admin for more AI credits.</>
              : <><b>⚠ You&apos;re running low on AI credits</b> ({p.ai.pct}% left). Ask the admin for more now, so you aren&apos;t stopped halfway through a resume or a message.</>}
          </div>
        )}
        <LinkBox key={restored} signedIn={p.signedIn} initial={restored || (!p.signedIn ? p.initialLink : "")} onStarting={() => setStarting(true)} onFailed={() => setStarting(false)} onStarted={(id) => { setScanId(id); announceJob(); }} />

        {p.signedIn && p.resumeName ? (
          <div className="mute" style={{ margin: "4px 8px 0", display: "flex", alignItems: "center", gap: 8, fontSize: 14, flexWrap: "wrap" }}>
            <span style={{ color: "var(--green)" }}>{Icon.check(16)}</span>Using {p.resumeName} · <Link href="/account" style={{ color: "var(--ink)", fontWeight: 600, padding: "10px 2px" }}>Change</Link> · {p.ownApify ? "unlimited on your Apify key · " : ""}{p.left} of {p.limit} free searches left
          </div>
        ) : (
          <ResumeUpload signedIn={p.signedIn} compact />
        )}

        {p.signedIn && !p.ownApify && <AskMore left={p.left ?? 0} used={p.used ?? 0} />}

        {returning && applied.length > 0 && (
          <section style={{ marginTop: 56 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, margin: "0 8px" }}>
              <h2 className="h2">Any news from these jobs?</h2>
              <span className="mute" style={{ fontSize: 14 }}>{applied.filter((j) => !picked[j.id]).length || "All"} {applied.filter((j) => !picked[j.id]).length ? "to update" : "updated"}</span>
            </div>
            <p className="mute" style={{ margin: "6px 8px 0", fontSize: 16 }}>Tell us what happened, and we&apos;ll remind you to follow up at the right time.</p>
            <div className="card" style={{ marginTop: 16, overflow: "hidden" }}>
              {applied.slice(0, 3).map((j, i) => {
                const t = letterTile(j.company || "?");
                const pk = picked[j.id];
                const likely = LIKELY[j.apply_status || "applied"] || LIKELY.applied;
                const opts = more[j.id] || pk ? ALL_OPTS : ALL_OPTS.filter((o) => likely.includes(o.key));
                const st = statusOf(j.apply_status);
                return (
                  <div key={j.id} style={{ padding: "18px 20px", borderTop: i ? "1px solid var(--line)" : undefined }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <span className="tile" style={{ width: 48, height: 48, background: t.bg, color: t.fg, fontWeight: 700, fontSize: t.letters.length > 1 ? 16 : 18 }}>{t.letters}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}><span style={{ fontSize: 18, fontWeight: 700 }}>{j.company}</span>{st && <span className="tag" style={{ background: st.bg, color: st.fg }}>{st.icon} {st.label}</span>}</div>
                        <div className="mute" style={{ fontSize: 14, marginTop: 2 }}>{j.title} · {j.apply_status === "replied" ? "they replied" : `you applied ${ago(j.applied_at)}`}</div>
                      </div>
                      {pk && <span style={{ display: "inline-flex", gap: 6, fontSize: 14, fontWeight: 700, color: "var(--green)" }}>{Icon.check(18)}{opts.find((o) => o.key === pk)?.label}</span>}
                    </div>
                    <div role="radiogroup" aria-label={`What happened with ${j.company}?`} style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14, marginLeft: 64 }}>
                      {opts.map((o) => (
                        <button key={o.key} className="opt" role="radio" aria-checked={pk === o.key} onClick={() => setStatus(j.id, o.key)}>{pk === o.key ? "✓ " : ""}{o.label}</button>
                      ))}
                      {!more[j.id] && !pk && <button className="btn ghost sm" onClick={() => setMore((x) => ({ ...x, [j.id]: true }))}>More…</button>}
                      {j.apply_status === "no_reply" && !pk && <Link href={`/jobs/${j.id}/reach-out`} className="btn sec sm">See the people</Link>}
                    </div>
                    {pk && GOOD_NEWS.includes(pk) && (
                      <div className="note" style={{ marginTop: 14, marginLeft: 64 }}>
                        <div style={{ fontSize: 16, fontWeight: 700 }}>{pk === "got_job" ? "Rajveer would love to hear how you did it" : pk === "interview" ? "Nice! Want to tell Rajveer about it?" : "Want to tell Rajveer?"}</div>
                        <div className="mute" style={{ fontSize: 14, lineHeight: 1.45, margin: "4px 0 12px" }}>Hunting Fox is his personal project, and hearing what worked helps him make it better for everyone.</div>
                        <ContactRows text={`Hi Rajveer, news from my Hunting Fox job search: ${j.company}`} />
                      </div>
                    )}
                    {pk === "got_job" && (
                      <div style={{ marginTop: 14, marginLeft: 64, padding: "16px 18px", background: "var(--green-bg)", borderRadius: 20, cornerShape: "squircle", color: "#1A6B3C" } as React.CSSProperties}>
                        <div style={{ fontSize: 18, fontWeight: 700 }}>Congratulations{first ? `, ${first}` : ""}!</div>
                        <div style={{ fontSize: 16, marginTop: 4 }}>Want us to stop reminding you about your other jobs?</div>
                        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                          <button className="btn sec" style={{ background: "#fff" }} onClick={() => setStopped(true)}>{stopped ? "✓ Reminders stopped" : "Yes, stop reminders"}</button>
                          <button className="btn sec" style={{ background: "#fff" }}>No, keep them</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {applied.length > 3 && (
                <Link href="/jobs" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderTop: "1px solid var(--line)", textDecoration: "none", fontSize: 16, fontWeight: 600, color: "var(--ink)" }}>See all {applied.length} jobs you applied to{Icon.chev()}</Link>
              )}
            </div>
          </section>
        )}

        {p.signedIn && jobs.length > 0 && (
          <section style={{ marginTop: 48 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, margin: "0 8px" }}>
              <h2 className="h2">Recently added</h2>
              <Link href="/jobs" style={{ fontSize: 16, fontWeight: 600, color: "var(--ink)", padding: "10px 4px" }}>See all</Link>
            </div>
            <div className="card" style={{ marginTop: 16, overflow: "hidden" }}>
              {jobs.slice(0, 3).map((j, i) => {
                const t = letterTile(j.company || "?");
                const working = j.status === "queued" || j.status === "scanning";
                return (
                  <Link key={j.id} href={`/jobs/${j.id}`} style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 20px", textDecoration: "none", borderTop: i ? "1px solid var(--line)" : undefined }}>
                    <span className="tile" style={{ width: 48, height: 48, background: t.bg, color: t.fg, fontWeight: 700, fontSize: t.letters.length > 1 ? 16 : 18 }}>{t.letters}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 18, fontWeight: 700 }}>{j.company || "Looking into it"}</span>
                      <span className="mute" style={{ display: "block", fontSize: 14, marginTop: 2 }}>{j.title || "Reading the job"}{working ? "" : j.status === "ready" ? " · ready" : " · see what happened"}</span>
                      {working && <LiveStep step={j.step} style={{ fontSize: 14, marginTop: 4 }} />}
                    </span>
                    {working ? <Spinner size={20} label="Still working" /> : <span style={{ color: "#7F8897" }}>{Icon.chev()}</span>}
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
                  <span style={{ color: "var(--ink)" }}>{icon}</span>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>{t}</span>
                  <span className="mute" style={{ fontSize: 14, lineHeight: 1.5, maxWidth: "28ch" }}>{d}</span>
                </div>
              ))}
            </div>
            <p style={{ margin: "40px 0 0", textAlign: "center", fontSize: 16, fontWeight: 600 }}>Free while we test it. Rajveer lets students in by hand.</p>
            <div className="mute" style={{ marginTop: 72, display: "flex", justifyContent: "center", alignItems: "center", gap: 10, fontSize: 14, textAlign: "center", flexWrap: "wrap" }}>
              <span style={{ color: "var(--green)" }}>{Icon.shield()}</span>
              <span>We check every company first, so you don&apos;t waste time on fake jobs. We never send anything for you.</span>
              <Link href="/remove-info">Remove my info</Link>
              <Link href="/terms">Terms</Link>
              <Link href="/privacy">Privacy</Link>
            </div>
          </>
        )}
      </main>
      {(starting || scanId) && <ProgressPopup jobId={scanId} email={p.email} onClose={() => { setScanId(null); setStarting(false); router.refresh(); }} />}
    </>
  );
}
