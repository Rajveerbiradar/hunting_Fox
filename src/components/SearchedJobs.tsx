"use client";
import Link from "next/link";
import { useState } from "react";
import { SearchBox } from "./SearchBox";
import { Header, LiveStep, Spinner, letterTile, useLiveJobs, useSort } from "./ui";
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

export function SearchedJobs({ jobs, left, limit, initial, email, approved, admin, ownApify }: { jobs: Row[]; left: number; limit: number; initial: string; email: string; approved: boolean; admin: boolean; ownApify: boolean }) {

  const [tab, setTab] = useState<keyof typeof TABS>("All");
  const [rows, setRows] = useLiveJobs(jobs);
  const sorter = useSort("myjobs");
  const visible = sorter.sort(rows).filter((r) => ((r.status === "queued" || r.status === "scanning") ? tab === "All" : TABS[tab](r)));
  const sections = ORDER.map((name) => ({ name, rows: visible.filter((r) => sectionOf(r) === name) })).filter((s) => s.rows.length);

  return (
    <>
      <Header signedIn initial={initial} showJobs={false} admin={admin} />
      <main className="wrap wide">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 className="h1">My jobs</h1>
            <p className="mute" style={{ margin: "12px 0 0", fontSize: 18 }}>{rows.length} {rows.length === 1 ? "job" : "jobs"} · {ownApify ? "unlimited on your Apify key" : `${left} of ${limit} searches left`}</p>
          </div>
          {rows.length > 1 && sorter.button}
        </div>

        {approved ? (
          <SearchBox email={email} />
        ) : (
          <div className="card" style={{ marginTop: 28, padding: "18px 22px", background: "#EEF1F5", fontSize: 16 }}>You can paste a job link here once Rajveer lets you in. <Link href="/" style={{ color: "var(--ink)", fontWeight: 600 }}>See where you are</Link></div>
        )}

        {rows.length === 0 ? (
          <div className="card" style={{ marginTop: 28, padding: "40px 26px", textAlign: "center" }}>
            <h2 className="h2" style={{ fontSize: 18, margin: 0 }}>No jobs yet</h2>
            <p className="mute" style={{ fontSize: 16, lineHeight: 1.5, margin: "8px auto 0", maxWidth: "46ch" }}>Paste a job link above. Every job you search shows up here, so you can keep track of who replied, interviews and offers.</p>
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
