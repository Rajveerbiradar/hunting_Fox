"use client";
import Link from "next/link";
import { useState } from "react";
import { Header, Icon, LiveStep, Spinner, letterTile, useLiveJobs } from "./ui";
import { StatusMenu } from "./StatusMenu";

type Row = { id: string; title: string | null; company: string | null; status: string; step?: number | null; apply_status: string | null; applied_at: string | null; created_at: string; verdict: string | null; people: number };

function ago(iso?: string | null) {
  if (!iso) return "";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
}

const TABS = {
  "All": () => true,
  "Not applied": (r: Row) => !r.apply_status,
  "Waiting": (r: Row) => ["applied", "no_reply"].includes(r.apply_status || ""),
  "Heard back": (r: Row) => ["replied", "interview", "got_job", "not_selected"].includes(r.apply_status || ""),
} as const;

function sectionOf(r: Row) {
  if (r.status === "queued" || r.status === "scanning") return "Still working on it";
  if (r.apply_status === "no_reply") return "Tell us what happened";
  if (!r.apply_status || r.apply_status === "not_applying") return "Not applied yet";
  if (r.apply_status === "applied") return "Waiting to hear";
  return "Heard back";
}
const ORDER = ["Tell us what happened", "Still working on it", "Not applied yet", "Waiting to hear", "Heard back"];

export function SearchedJobs({ jobs, left, limit, initial }: { jobs: Row[]; left: number; limit: number; initial: string }) {
  const [tab, setTab] = useState<keyof typeof TABS>("All");
  const [rows, setRows] = useLiveJobs(jobs);
  const visible = rows.filter((r) => ((r.status === "queued" || r.status === "scanning") ? tab === "All" : TABS[tab](r)));
  const sections = ORDER.map((name) => ({ name, rows: visible.filter((r) => sectionOf(r) === name) })).filter((s) => s.rows.length);

  return (
    <>
      <Header signedIn initial={initial} showJobs={false} />
      <main className="wrap wide">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 className="h1">My jobs</h1>
            <p className="mute" style={{ margin: "12px 0 0", fontSize: 18 }}>{rows.length} jobs · {left} of {limit} searches left</p>
          </div>
          <Link href="/" className="btn on-grey">{Icon.plus()}New search</Link>
        </div>

        {rows.length === 0 ? (
          <div className="card" style={{ marginTop: 28, padding: 26 }}>
            <h2 className="h2" style={{ fontSize: 18 }}>No jobs here yet</h2>
            <p className="mute" style={{ fontSize: 16, lineHeight: 1.5 }}>When you paste a job link, it shows up here. You can then keep track of every job you apply to: who replied, interviews, and offers.</p>
            <Link href="/" className="btn pri">Paste a job link</Link>
          </div>
        ) : (
          <>
            <div className="seg" role="tablist" aria-label="Filter jobs" style={{ marginTop: 28 }}>
              {(Object.keys(TABS) as (keyof typeof TABS)[]).map((t) => (
                <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t}</button>
              ))}
            </div>
            {sections.map((s) => (
              <section key={s.name} style={{ marginTop: 40 }}>
                <div className="lbl" style={{ margin: "0 8px" }}>{s.name} · {s.rows.length}</div>
                <div className="card" style={{ marginTop: 12 }}>
                  {s.rows.map((r, i) => {
                    const t = letterTile(r.company || "?");
                    const working = r.status === "queued" || r.status === "scanning";
                    const bad = r.status === "fake" || r.verdict === "fake";
                    const action = working ? null
                      : r.status === "failed" ? { label: "See what happened", kind: "sec" }
                      : bad ? { label: "See why", kind: "sec" }
                      : r.apply_status === "no_reply" ? { label: "Send a follow-up", kind: "sec sm", href: `/jobs/${r.id}/reach-out` }
                      : null;
                    return (
                      <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", padding: "16px 20px", borderTop: i ? "1px solid var(--line)" : undefined }}>
                        <span className="tile" style={{ width: 48, height: 48, background: t.bg, color: t.fg, fontWeight: 700, fontSize: t.letters.length > 1 ? 16 : 18 }}>{t.letters}</span>
                        <div style={{ flex: "1 1 220px", minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                          <Link href={`/jobs/${r.id}`} style={{ fontSize: 18, fontWeight: 700, textDecoration: "none" }}>{r.company || "Looking into it"}</Link>
                          <div className="mute" style={{ fontSize: 14 }}>{r.title || "Reading the job"}</div>
                          <div className="mute" style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", fontSize: 14 }}>
                            {working && <LiveStep step={r.step} />}
                            {r.verdict === "genuine" && <span style={{ fontWeight: 600, color: "var(--green)" }}>✓ Real company</span>}
                            {bad && <span className="tag" style={{ background: "#B8132F", color: "#fff", fontWeight: 700 }}>⚠ May be fake</span>}
                            {r.status === "closed" && <span style={{ fontWeight: 700 }}>Job closed</span>}
                            {r.status === "ready" && <span>{r.people ? `${r.people} ${r.people === 1 ? "person" : "people"} found` : "No people found"}</span>}
                            <span>{r.applied_at ? `Applied ${ago(r.applied_at)}` : `Added ${ago(r.created_at)}`}</span>
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
                          {working ? (
                            <Spinner size={20} label="Still working on it" />
                          ) : r.status === "ready" ? (
                            <StatusMenu jobId={r.id} value={r.apply_status} onChange={(v) => setRows((x) => x.map((y) => (y.id === r.id ? { ...y, apply_status: v, applied_at: v === "applied" ? new Date().toISOString() : y.applied_at } : y)))} />
                          ) : null}
                          {action && <Link href={action.href || `/jobs/${r.id}`} className={`btn ${action.kind}`}>{action.label}</Link>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
            <p className="mute" style={{ margin: "28px 8px 0", fontSize: 14 }}>Tap a status to change it.</p>
          </>
        )}
      </main>
    </>
  );
}
