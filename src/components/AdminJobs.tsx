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
  // "Results": exactly what the student got (checks, resume changes, people), to review quality.
  const [resOpen, setResOpen] = useState<string | null>(null);
  const [res, setRes] = useState<Res | null>(null);
  async function openRes(id: string) {
    if (resOpen === id) { setResOpen(null); return; }
    setResOpen(id); setRes(null);
    const d = await fetch(`/api/admin/jobs?result=${id}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    setRes(d || { verdict: null, checks: [], resume: null, people: [] });
  }
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
                <button className="btn sec sm" aria-expanded={resOpen === j.id} onClick={() => openRes(j.id)}>{resOpen === j.id ? "Hide results" : "Results"}</button>
                <button className="btn sec sm" aria-expanded={logOpen === j.id} onClick={() => openLog(j.id)}>{logOpen === j.id ? "Hide log" : "Log"}</button>
                <a className="btn sec sm" href={j.url} target="_blank" rel="noopener">Job post</a>
                {j.status === "ready" && <Link className="btn sec sm" href={`/jobs/${j.id}`}>Open</Link>}
              </div>
              {resOpen === j.id && <ResultPanel res={res} />}
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
      <p className="mute" style={{ margin: "16px 8px 0", fontSize: 14 }}>&quot;Run again&quot; doesn&apos;t use one of the student&apos;s searches. Each job runs on its own, so one stuck job never holds up the others. &quot;Open&quot; works only for your own jobs.</p>
      {toast.el}
    </>
  );
}

type Res = {
  verdict: string | null;
  checks: { group?: string; text: string; result: string }[];
  resume: null | {
    failed: string | null; applied: boolean; rewrite_error: string | null;
    company_brief: { believes: string; building: string; deliver: string } | null;
    priorities: { need: string; proof: string; strength: string }[];
    gaps: { question: string; why: string }[];
    skill_questions: { skill: string; why: string }[];
    edits: { old: string; new: string; reason: string; group?: string }[];
    summary_insert: { text: string; reason: string } | null;
    decisions: Record<string, boolean>;
  };
  people: { name: string; title: string; why?: string; email?: string; profileUrl?: string; skills: string[] }[];
};

/** What the student got for one job: company checks, resume changes (old → new), questions, and the ranked people. */
function ResultPanel({ res }: { res: Res | null }) {
  const H = ({ children }: { children: React.ReactNode }) => <div className="lbl" style={{ margin: "14px 0 6px" }}>{children}</div>;
  if (!res) return <div style={{ flexBasis: "100%", background: "var(--sunken)", borderRadius: 14, padding: 12 }} className="mute"><Spinner size={16} /> Loading results…</div>;
  const r = res.resume;
  const color = (x: string) => x === "pass" || x === "strong" ? "#1a6b3c" : x === "fail" || x === "none" ? "#b8132f" : x === "warn" || x === "weak" ? "#4f3e00" : "var(--mute)";
  return (
    <div style={{ flexBasis: "100%", background: "var(--sunken)", borderRadius: 14, padding: "4px 14px 14px", fontSize: 14, lineHeight: 1.5 }}>
      <H>Company check · {res.verdict || "no verdict"}</H>
      {res.checks.length ? res.checks.map((c, k) => <div key={k}><b style={{ color: color(c.result) }}>{c.result}</b> · {c.text}</div>) : <div className="mute">No checks saved.</div>}

      <H>Resume{r ? (r.failed ? ` · failed: ${r.failed}` : r.applied ? " · applied by the student" : " · not applied yet") : ""}</H>
      {!r ? <div className="mute">No resume work on this job.</div> : <>
        {r.rewrite_error && <div style={{ color: "#b8132f" }}>Last rewrite failed: {r.rewrite_error}</div>}
        {r.company_brief && <div style={{ marginBottom: 6 }}><b>Believes:</b> {r.company_brief.believes}<br /><b>Building:</b> {r.company_brief.building}<br /><b>Would deliver:</b> {r.company_brief.deliver}</div>}
        {r.priorities.map((p, k) => <div key={k}><b style={{ color: color(p.strength) }}>{p.strength}</b> · {p.need} <span className="mute">· proof: {p.proof || "none"}</span></div>)}
        {r.summary_insert && <div style={{ marginTop: 6, background: "#e5f3e9", borderRadius: 10, padding: "6px 10px" }}><b>New summary:</b> {r.summary_insert.text}</div>}
        {r.edits.map((e, k) => {
          const dropped = r.decisions[e.group || String(k)] === false;
          return (
            <div key={k} style={{ marginTop: 8, opacity: dropped ? 0.5 : 1 }}>
              {e.old && <div style={{ background: "#fdecef", color: "#b8132f", borderRadius: 10, padding: "4px 10px", textDecoration: "line-through" }}>{e.old}</div>}
              <div style={{ background: "#e5f3e9", color: "#1a6b3c", borderRadius: 10, padding: "4px 10px", marginTop: 2 }}>{e.new}</div>
              <div className="mute" style={{ fontSize: 13 }}>{dropped ? "Dropped by the student · " : ""}{e.reason}</div>
            </div>
          );
        })}
        {!r.edits.length && !r.failed && <div className="mute">No changes suggested.</div>}
        {r.gaps.length > 0 && <><H>Questions asked</H>{r.gaps.map((g, k) => <div key={k}>• {g.question} <span className="mute">({g.why})</span></div>)}</>}
        {r.skill_questions.length > 0 && <><H>Skills asked about</H><div>{r.skill_questions.map((q) => q.skill).join(" · ")}</div></>}
      </>}

      <H>People shown ({res.people.length})</H>
      {res.people.length ? res.people.map((p, k) => (
        <div key={k} style={{ marginTop: 6 }}>
          <b>{k + 1}. {p.name}</b> · {p.title} {p.email && <span style={{ color: "#1a6b3c" }}>· {p.email}</span>} {p.profileUrl && <a href={p.profileUrl} target="_blank" rel="noopener">LinkedIn</a>}
          {p.why && <div className="mute">{p.why}</div>}
          {p.skills.length > 0 && <div className="mute" style={{ fontSize: 13 }}>Skills: {p.skills.join(", ")}</div>}
        </div>
      )) : <div className="mute">No people.</div>}
    </div>
  );
}
