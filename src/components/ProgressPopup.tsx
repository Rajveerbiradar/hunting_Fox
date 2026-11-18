"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon, Spinner } from "./ui";
import { PROBLEMS, STEPS } from "@/lib/status";

type JobRow = { id: string; status: string; step: number; step_detail?: string | null; error?: string | null; company?: string | null; title?: string | null };

/** Shown after "Show me what to do". Polls the job row and says exactly which step we're on. */
/** jobId is null for the second between pressing the button and the server answering: the popup shows straight away. */
export function ProgressPopup({ jobId, email, onClose }: { jobId: string | null; email?: string; onClose: () => void }) {
  const [job, setJob] = useState<JobRow | null>(null);
  const [details, setDetails] = useState<string[]>([]);

  useEffect(() => {
    if (!jobId) return;
    let alive = true;
    const tick = async () => {
      const r = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" }).catch(() => null);
      const d = r && r.ok ? await r.json() : null;
      if (!alive || !d?.job) return;
      const j: JobRow = d.job;
      setJob(j);
      // Remember the finished line of each step (step_detail describes the step just finished).
      if (j.step > 0 && j.step_detail) setDetails((prev) => { const n = [...prev]; n[j.step - 1] = j.step_detail!; return n; });
      if (["ready", "failed", "closed", "fake", "agency"].includes(j.status) && j.step >= 5) return;
      if (["failed", "closed", "fake"].includes(j.status)) return;
      setTimeout(tick, 1500);
    };
    tick();
    return () => { alive = false; };
  }, [jobId]);

  useEffect(() => {
    const name = job?.company || "this job";
    document.title = job?.status === "ready" ? `✓ ${name} is ready` : `Step ${Math.min((job?.step ?? 0) + 1, 5)} of 5 · ${name}`;
    return () => { document.title = "Hunting Fox"; };
  }, [job]);

  const step = job?.step ?? 0;
  const done = job?.status === "ready";
  const problem = job && ["failed", "closed", "fake"].includes(job.status) ? PROBLEMS[job.error === "not_found" ? "not_found" : job.error === "own_key_out" ? "own_key_out" : job.status] : null;
  const company = job?.company || "this job";
  const secs = [50, 40, 30, 15, 5][Math.min(step, 4)];

  return (
    <div className="ov">
      <div className="pop" role="dialog" aria-modal="true" aria-labelledby="poptitle">
        {problem ? (
          <>
            <span className="tile" style={{ background: "#FDECEF", color: "#B8132F", fontWeight: 700, fontSize: 24 }}>!</span>
            <h2 id="poptitle" className="h2" style={{ marginTop: 16 }}>{problem.title}</h2>
            <p className="mute" style={{ fontSize: 16, lineHeight: 1.5 }}>{problem.text}</p>
            {problem.foot && <p style={{ fontSize: 14, color: "var(--green)", fontWeight: 600 }}>{problem.foot}</p>}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16, flexWrap: "wrap" }}>
              {job?.status === "fake" && <Link href={`/jobs/${jobId}`} className="btn sec">See why</Link>}
              <button className="btn pri" onClick={onClose}>Go back home</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              {done ? <span className="tile" style={{ width: 44, height: 44, background: "var(--green-bg)", color: "var(--green)" }}>{Icon.check(24)}</span> : <Spinner size={44} label="Working" />}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="lbl">{done ? "Done" : `Step ${step + 1} of 5`}</div>
                <h2 id="poptitle" aria-live="polite" className="h2" style={{ marginTop: 4, lineHeight: 1.25 }}>
                  {done ? `Here's what to do for ${company}` : STEPS[Math.min(step, 4)].label.replace("the company", company === "this job" ? "the company" : company)}
                </h2>
              </div>
            </div>
            <div className="bar" aria-hidden>{STEPS.map((_, i) => <span key={i} className={i < step || done ? "ok" : i === step ? "on" : ""} />)}</div>
            <div style={{ marginTop: 16 }}>
              {STEPS.map((s, i) => {
                const d = i < step || done, a = i === step && !done;
                const detail = d ? details[i] : a ? s.running : "";
                return (
                  <div className="st" key={i}>
                    <span style={{ width: 24, height: 24, flex: "none", display: "grid", placeItems: "center", marginTop: 1 }}>
                      {d ? <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1E7A47" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9.5" /><path d="M8 12.3l2.8 2.8L16.2 9.5" /></svg>
                        : a ? <Spinner size={20} />
                        : <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="1.6"><circle cx="12" cy="12" r="9.5" strokeDasharray="2.5 3" /></svg>}
                    </span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 16, lineHeight: 1.35, fontWeight: a ? 700 : 400, color: d || a ? "var(--ink)" : "var(--mute2)" }}>{s.label}</div>
                      {detail && <div className="mute" style={{ fontSize: 14, lineHeight: 1.45, marginTop: 2 }}>{detail}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
            {done ? (
              <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
                <Link href={`/jobs/${jobId}`} className="btn lg pri">Show me what to do{Icon.arrow()}</Link>
              </div>
            ) : (
              <>
                <p className="mute" style={{ margin: "16px 0 0", fontSize: 14, lineHeight: 1.5 }}>
                  About {secs} seconds left. You can close this. We&apos;ll keep going{email ? <> and you&apos;ll find it in My jobs</> : null}.
                </p>
                <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end" }}>
                  <button className="btn lg sec" onClick={onClose}>Close and keep going</button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
