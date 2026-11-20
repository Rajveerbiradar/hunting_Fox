import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { adminClient, currentUser } from "@/lib/supabase/clients";
import { Header } from "@/components/ui";
import { ResumeDoc } from "@/components/ResumeDoc";
import { finalLines, isPersonalised } from "@/lib/resumeDiff";
import { lineDiff } from "@/lib/lineDiff";
import type { ResumePart } from "@/lib/pipeline/types";

export const dynamic = "force-dynamic";

type Version = { id: number; created_at: string; source: string; lines: string; note: string | null; raw: string | null; file_path: string | null; job_id: string | null };

const SOURCE: Record<string, string> = {
  upload: "Uploaded a resume",
  setup_fix: "Changed a part on the setup page",
  setup_add: "Added a part on the setup page",
  setup_undo: "Undid a change on the setup page",
  make_main: "Made a job's resume their main resume",
  undo_main: "Put their old main resume back",
};

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const split = (s: string | null | undefined) => (s || "").split("\n").filter((l) => l.trim());

/** What changed from one version to the next: only the changed lines, removed in red and added in green. */
function Changes({ before, after }: { before: string[]; after: string[] }) {
  const ops = lineDiff(before, after).filter((o) => o.kind !== "same");
  if (!ops.length) return <div className="mute" style={{ fontSize: 14 }}>No lines changed.</div>;
  return (
    <div style={{ display: "grid", gap: 4, fontSize: 14, lineHeight: 1.45 }}>
      {ops.map((o, i) => (
        <div key={i} style={{ padding: "4px 10px", borderRadius: 8, background: o.kind === "del" ? "var(--red-bg)" : "var(--green-bg)", color: o.kind === "del" ? "var(--red)" : "var(--green)", textDecoration: o.kind === "del" ? "line-through" : undefined, overflowWrap: "anywhere" }}>
          {o.kind === "del" ? "− " : "+ "}{o.text}
        </div>
      ))}
    </div>
  );
}

/** Admin only: every resume a student has had, how each change happened, and the resume made for each job. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await currentUser())) redirect(`/sign-in?next=/admin/students/${id}`);
  if (!(await requireAdmin())) notFound();
  const sb = adminClient();

  const [{ data: p }, versionsRes, { data: jobs }, { data: files }] = await Promise.all([
    sb.from("profiles").select("id,name,email,resume_text,resume_path,skills,facts,resume_added_at").eq("id", id).maybeSingle(),
    sb.from("resume_versions").select("id,created_at,source,lines,note,raw,file_path,job_id").eq("user_id", id).order("created_at", { ascending: true }),
    sb.from("jobs").select("id,title,company,status,created_at").eq("user_id", id).order("created_at", { ascending: false }),
    sb.storage.from("resumes").list(id, { sortBy: { column: "created_at", order: "desc" } }),
  ]);
  if (!p) notFound();
  const versions = (versionsRes.data || []) as Version[];
  const tableMissing = !!versionsRes.error;
  const levels = Object.fromEntries(((p.skills || []) as { name: string; level: number }[]).map((s) => [s.name.toLowerCase(), s.level]));

  // Every file they uploaded is kept (name starts with the upload time): signed links for one hour.
  const fileList = (files || []).filter((f) => f.name && !f.name.startsWith("."));
  const signed = fileList.length ? (await sb.storage.from("resumes").createSignedUrls(fileList.map((f) => `${id}/${f.name}`), 3600)).data || [] : [];
  const fileRows = fileList.map((f, i) => {
    const ms = Number(f.name.split("-")[0]);
    return { name: f.name.replace(/^\d+-/, ""), at: ms ? new Date(ms).toISOString() : f.created_at, url: signed[i]?.signedUrl, current: `${id}/${f.name}` === p.resume_path };
  });

  const { data: reports } = (jobs || []).length ? await sb.from("reports").select("job_id,resume,company_data").in("job_id", (jobs || []).map((j) => j.id)) : { data: [] };
  const byJob = new Map((reports || []).map((r) => [r.job_id, r]));
  const jobName = new Map((jobs || []).map((j) => [j.id, j.company || j.title || "a job"]));

  const nowLines = split(p.resume_text);
  const first = (p.name || p.email || "?").split(" ")[0];

  return (
    <>
      <Header signedIn admin back={{ href: "/admin", label: "Admin" }} />
      <main className="wrap" style={{ maxWidth: 1000, paddingTop: 24, paddingBottom: 64 }}>
        <h1 className="h1" style={{ margin: 0 }}>{p.name || "No name"}&apos;s resumes</h1>
        <p className="mute" style={{ fontSize: 16, margin: "8px 0 24px" }}>{p.email} · read-only. How the main resume was built, and the resume made for every job.</p>

        {/* 1. Files they uploaded */}
        <section className="card" style={{ padding: 24, marginBottom: 16 }}>
          <h2 className="h2" style={{ margin: "0 0 12px", fontSize: 24 }}>Files {first} uploaded</h2>
          {!fileRows.length ? <div className="mute">No files.</div> : (
            <div style={{ display: "grid", gap: 8 }}>
              {fileRows.map((f) => (
                <div key={f.name + f.at} style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{f.name}</span>
                  <span className="mute" style={{ fontSize: 14 }}>{when(f.at)}</span>
                  {f.current && <span className="tag" style={{ background: "var(--info-bg, #e7effa)", color: "var(--info, #164a88)" }}>Latest upload</span>}
                  {f.url && <a className="btn sec sm" href={f.url} target="_blank" rel="noopener">Open file</a>}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 2. The main resume now */}
        <details className="card" style={{ padding: 24, marginBottom: 16 }} open>
          <summary style={{ cursor: "pointer", fontSize: 24, fontWeight: 700 }}>Main resume now</summary>
          <div style={{ marginTop: 16 }}>{nowLines.length ? <ResumeDoc lines={nowLines} /> : <div className="mute">No resume yet.</div>}</div>
        </details>

        {/* 3. History of the main resume */}
        <section className="card" style={{ padding: 24, marginBottom: 16 }}>
          <h2 className="h2" style={{ margin: "0 0 4px", fontSize: 24 }}>How the main resume changed</h2>
          <p className="mute" style={{ fontSize: 14, margin: "0 0 16px" }}>Oldest first. Each step shows only the lines that changed; open it for the whole resume at that point.</p>
          {tableMissing && <div className="note" style={{ background: "#ffefb0", color: "#4f3e00", marginBottom: 12 }}>⚠ Run <b>supabase/migrations/009_resume_versions.sql</b> in Supabase to start keeping the history.</div>}
          {!tableMissing && !versions.length && <div className="mute">No changes kept yet. History starts from 20 Nov 2026; earlier changes weren&apos;t stored.</div>}
          <div style={{ display: "grid", gap: 12 }}>
            {versions.map((v, i) => {
              const before = i ? split(versions[i - 1].lines) : [];
              const after = split(v.lines);
              return (
                <div key={v.id} className="note" style={{ display: "grid", gap: 10 }}>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
                    <span style={{ fontWeight: 700 }}>{SOURCE[v.source] || v.source}</span>
                    <span className="mute" style={{ fontSize: 14 }}>{when(v.created_at)}</span>
                    {v.job_id && <a className="mute" style={{ fontSize: 14 }} href={`/jobs/${v.job_id}/resume`} target="_blank" rel="noopener">for {jobName.get(v.job_id) || "a job"} ↗</a>}
                  </div>
                  {v.note && <div style={{ fontSize: 14, lineHeight: 1.5 }}><span className="mute">{v.source === "upload" ? "File: " : "What they wrote: "}</span>{v.note}</div>}
                  {v.source === "upload" ? <div className="mute" style={{ fontSize: 14 }}>New resume read from the file ({after.length} lines).</div> : <Changes before={before} after={after} />}
                  {v.raw && (
                    <details><summary style={{ cursor: "pointer", fontSize: 14, fontWeight: 600 }}>Text in the uploaded file (before our AI read it)</summary>
                      <pre style={{ whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.5, margin: "8px 0 0", fontFamily: "inherit" }}>{v.raw}</pre>
                    </details>
                  )}
                  <details><summary style={{ cursor: "pointer", fontSize: 14, fontWeight: 600 }}>Whole resume after this step</summary>
                    <div style={{ marginTop: 10, background: "#fff", borderRadius: 16, padding: 12 }}><ResumeDoc lines={after} /></div>
                  </details>
                </div>
              );
            })}
          </div>
        </section>

        {/* 4. The resume made for each job */}
        <section className="card" style={{ padding: 24 }}>
          <h2 className="h2" style={{ margin: "0 0 4px", fontSize: 24 }}>Resumes made for jobs</h2>
          <p className="mute" style={{ fontSize: 14, margin: "0 0 16px" }}>What the PDF holds for each job: only the changes {first} applied. &quot;Open&quot; shows the page exactly as they see it.</p>
          {!(jobs || []).length && <div className="mute">No searches yet.</div>}
          <div style={{ display: "grid", gap: 12 }}>
            {(jobs || []).map((j) => {
              const rep = byJob.get(j.id) as { resume?: ResumePart & { applied?: boolean; failed?: boolean; made_main_at?: string } | null; company_data?: { name?: string } } | undefined;
              const r = rep?.resume || null;
              const name = rep?.company_data?.name || j.company || j.title || "Job";
              const custom = r ? isPersonalised(r, levels) : false;
              const lines = r && custom ? finalLines(r, levels) : [];
              const status = !r ? "No resume made" : r.failed ? "Rewrite failed" : !r.v ? "Old format" : r.applied ? (custom ? "Changes applied" : "Applied, nothing changed") : "Suggested, not applied yet";
              return (
                <details key={j.id} className="note">
                  <summary style={{ cursor: "pointer", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
                    <span style={{ fontWeight: 700 }}>{name}</span>
                    {j.title && <span className="mute" style={{ fontSize: 14 }}>{j.title}</span>}
                    <span className="mute" style={{ fontSize: 14 }}>{when(j.created_at)}</span>
                    <span className="tag" style={{ background: custom ? "var(--green-bg)" : "var(--tile)", color: custom ? "var(--green)" : "var(--mute)" }}>{status}</span>
                    {r?.made_main_at && <span className="tag" style={{ background: "var(--tile)", color: "var(--mute)" }}>Made main</span>}
                  </summary>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
                    <a className="btn sec sm" href={`/jobs/${j.id}/resume`} target="_blank" rel="noopener">Open their resume page</a>
                    <a className="btn sec sm" href={`/jobs/${j.id}`} target="_blank" rel="noopener">Open the job</a>
                  </div>
                  {custom ? (
                    <>
                      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>What changed from the main resume</div>
                      <Changes before={r!.base_lines || nowLines} after={lines} />
                      <details style={{ marginTop: 10 }}><summary style={{ cursor: "pointer", fontSize: 14, fontWeight: 600 }}>Whole resume for {name}</summary>
                        <div style={{ marginTop: 10, background: "#fff", borderRadius: 16, padding: 12 }}><ResumeDoc lines={lines} /></div>
                      </details>
                    </>
                  ) : <div className="mute" style={{ fontSize: 14 }}>Same as their main resume.</div>}
                </details>
              );
            })}
          </div>
        </section>
        <p className="mute" style={{ fontSize: 14, marginTop: 16 }}><Link href="/admin">Back to admin</Link></p>
      </main>
    </>
  );
}
