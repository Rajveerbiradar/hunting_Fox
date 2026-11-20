"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { LiveStep, Spinner, letterTile, useSort, useToast } from "./ui";

type L = { at: string; level: "info" | "warn" | "error"; step: string | null; msg: string; ms: number | null };
type J = { id: string; url: string; portal: string; status: string; step: number; error: string | null; title: string | null; company: string | null; created_at: string; finished_at: string | null; own_key: boolean; people: number | null; verdict: string | null; student: string };

const STATUS: Record<string, [string, string, string]> = {
  ready: ["✓ Ready", "var(--green-bg)", "var(--green)"],
  failed: ["Failed", "var(--red-bg)", "var(--red)"],
  fake: ["⚠ May be fake", "var(--red)", "#fff"],
  closed: ["Closed", "var(--tile)", "var(--mute)"],
  agency: ["Agency", "var(--tile)", "var(--mute)"],
};
function ago(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.floor(m / 60)} h ago` : `${Math.floor(m / 1440)} days ago`;
}
function took(j: J) {
  if (!j.finished_at) return `running ${Math.max(0, Math.round((Date.now() - new Date(j.created_at).getTime()) / 1000))}s`;
  const s = Math.round((new Date(j.finished_at).getTime() - new Date(j.created_at).getTime()) / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}

/** Every job link students pasted. Failed ones show why and can be run again. */
export function AdminJobs() {
  const [jobs, setJobs] = useState<J[] | null>(null);
  const [tab, setTab] = useState("all");
  const [site, setSite] = useState("all");
  const sorter = useSort("admin_jobs");
  const [logOpen, setLogOpen] = useState<string | null>(null);
  const [log, setLog] = useState<{ lines: L[]; error?: string } | null>(null);
  async function openLog(id: string) {
    if (logOpen === id) { setLogOpen(null); return; }
    setLogOpen(id); setLog(null);
    const d = await fetch(`/api/admin/jobs?log=${id}`, { cache: "no-store" }).then((r) => r.json()).catch(() => ({ log: [], error: "Couldn't load the log." }));
    setLog({ lines: d.log || [], error: d.error });
  }
  const toast = useToast();

  const load = () => fetch("/api/admin/jobs", { cache: "no-store" }).then((r) => r.json()).then((d) => setJobs(d.jobs || []));
  useEffect(() => { load(); }, []);
  // Keep running jobs moving.
  useEffect(() => {
    if (!jobs?.some((j) => j.status === "queued" || j.status === "scanning")) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [jobs]);

  if (!jobs) return <div className="card row" style={{ marginTop: 16 }}><Spinner size={20} />Loading jobs…</div>;
  const working = (j: J) => j.status === "queued" || j.status === "scanning";
  const TABS: [string, string, (j: J) => boolean][] = [
    ["all", `All · ${jobs.length}`, () => true],
    ["working", `Running · ${jobs.filter(working).length}`, working],
    ["ready", "Ready", (j) => j.status === "ready"],
    ["failed", `Failed · ${jobs.filter((j) => j.status === "failed").length}`, (j) => j.status === "failed"],
    ["other", "Fake, closed, agency", (j) => ["fake", "closed", "agency"].includes(j.status)],
  ];
  const f = TABS.find((t) => t[0] === tab)![2];
  const list = sorter.sort(jobs).filter((j) => f(j) && (site === "all" || j.portal === site));

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 24 }}>
        <div className="seg" role="tablist" aria-label="Which jobs">{TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>)}</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <label className="sr" htmlFor="site">Site</label>
          <select id="site" className="sel" style={{ background: "#fff" }} value={site} onChange={(e) => setSite(e.target.value)}><option value="all">All sites</option><option value="linkedin">LinkedIn</option><option value="naukri">Naukri</option></select>
          {list.length > 1 && sorter.button}
        </div>
      </div>
      <div className="card" style={{ marginTop: 16, overflow: "hidden" }}>
        {!list.length && <div style={{ padding: "24px 20px" }} className="mute">No jobs here.</div>}
        {list.map((j, i) => {
          const t = letterTile(j.company || "?");
          const st = STATUS[j.status];
          return (
            <div key={j.id} className="row" style={{ alignItems: "flex-start", borderTop: i ? "1px solid var(--line)" : undefined }}>
              <span className="tile" style={{ width: 48, height: 48, background: t.bg, color: t.fg, fontWeight: 700, fontSize: t.letters.length > 1 ? 16 : 18 }}>{t.letters}</span>
              <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 18, fontWeight: 700 }}>{j.company || "Reading the job"}</span>
                  {st ? <span className="tag" style={{ background: st[1], color: st[2], fontWeight: j.status === "failed" || j.status === "fake" ? 700 : 600 }}>{st[0]}</span> : <LiveStep step={j.step} style={{ fontSize: 14 }} />}
                  {j.own_key && <span className="tag" style={{ background: "var(--info-bg)", color: "var(--info)" }}>Own key</span>}
                </div>
                <div className="mute" style={{ fontSize: 14, marginTop: 2 }}>{j.title || "…"} · {j.portal === "naukri" ? "Naukri" : "LinkedIn"}</div>
                <div className="mute" style={{ fontSize: 14, marginTop: 2 }}>{j.student} · {ago(j.created_at)} · {took(j)}{j.people != null ? ` · ${j.people} ${j.people === 1 ? "person" : "people"}` : ""}</div>
                {j.error && <div style={{ fontSize: 14, marginTop: 6, color: "var(--red)", fontFamily: "ui-monospace, Menlo, monospace", wordBreak: "break-word" }}>{j.error}</div>}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(j.status === "failed" || (working(j) && Date.now() - new Date(j.created_at).getTime() > 10 * 60_000)) && (
                  <button className="btn sec sm" onClick={async () => { await fetch("/api/admin/jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: j.id }) }); toast.show("Running again"); load(); }}>Run again</button>
                )}
                <button className="btn sec sm" aria-expanded={logOpen === j.id} onClick={() => openLog(j.id)}>{logOpen === j.id ? "Hide log" : "Log"}</button>
                <a className="btn sec sm" href={j.url} target="_blank" rel="noopener">Job post</a>
                {/* Results: the student's own job page, exactly as they see it (read-only admin view), for every outcome. */}
                <Link className="btn sec sm" href={`/jobs/${j.id}`} target="_blank">Results</Link>
              </div>
              {logOpen === j.id && (
                <div style={{ flexBasis: "100%", background: "var(--sunken)", borderRadius: 14, padding: 12, overflowX: "auto" }}>
                  {!log ? <div className="mute" style={{ display: "flex", gap: 8, alignItems: "center" }}><Spinner size={16} />Loading log…</div>
                    : log.error ? <div style={{ color: "var(--red)", fontSize: 14 }}>{log.error}</div>
                    : !log.lines.length ? <div className="mute" style={{ fontSize: 14 }}>No log lines for this job (it ran before logging was added).</div>
                    : (
                      <table style={{ borderCollapse: "collapse", fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12.5, lineHeight: 1.5, width: "100%" }}>
                        <tbody>
                          {log.lines.map((l, k) => (
                            <tr key={k} style={{ verticalAlign: "top", color: l.level === "error" ? "var(--red)" : l.level === "warn" ? "#7A4A00" : "var(--ink)" }}>
                              <td style={{ padding: "2px 10px 2px 0", whiteSpace: "nowrap", color: "var(--mute)" }}>{l.ms != null ? `+${(l.ms / 1000).toFixed(1)}s` : new Date(l.at).toLocaleTimeString()}</td>
                              <td style={{ padding: "2px 10px 2px 0", whiteSpace: "nowrap", fontWeight: 700 }}>{l.level === "info" ? "" : l.level.toUpperCase()} {l.step}</td>
                              <td style={{ padding: "2px 0", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{l.msg}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="mute" style={{ margin: "16px 8px 0", fontSize: 14 }}>&quot;Run again&quot; doesn&apos;t use one of the student&apos;s searches. Each job runs on its own, so one stuck job never holds up the others. &quot;Results&quot; opens the student&apos;s own job page, exactly as they see it (read-only).</p>
      {toast.el}
    </>
  );
}

