"use client";
import { useMemo, useState } from "react";
import { BackLink, Header, Icon, copyText, useToast } from "./ui";
import { ResumeUpload } from "./ResumeUpload";
import { appliedUse, buildDiff } from "@/lib/resumeDiff";
import { Spinner } from "./ui";
import { ResumeDoc, type DocMark } from "./ResumeDoc";
import { PdfButton } from "./PdfButton";
import { ADDS_TO_RESUME, SKILL_LEVELS } from "@/lib/status";

type Skill = { name: string; level: number; from_job?: string };
type R = {
  base_lines: string[]; edits: { old: string; new: string; reason: string; group?: string }[]; skill_questions: { skill: string; why: string }[];
  suggestions: { title: string; why: string }[]; summary_insert?: { text: string; reason: string };
  v?: 2; applied?: boolean; applied_at?: string; decisions?: Record<string, boolean>;
  priorities?: { need: string; proof: string; strength: "strong" | "weak" | "none" }[];
  gaps?: { id: string; question: string; why: string }[];
};

export function ResumePage({ jobId, company, resume: start, hasResume, skills, initial, portal }: { jobId: string; company: string; resume: R | null; hasResume: boolean; skills: Skill[]; initial: string; portal: string }) {
  const [resume, setResume] = useState<R | null>(start);
  const [mine, setMine] = useState<Skill[]>(skills);
  const [editing, setEditing] = useState<Record<string, boolean>>({});
  const toast = useToast();
  const levels = useMemo(() => Object.fromEntries(mine.map((s) => [s.name.toLowerCase(), s.level])), [mine]);
  // Suggestions are reviewed here; Final and the PDF only use what was applied ("Apply changes").
  const review = resume?.v === 2;
  const [decisions, setDecisions] = useState<Record<string, boolean>>(start?.decisions || {});
  const [appliedAt, setAppliedAt] = useState<string | undefined>(start?.applied ? start.applied_at || "yes" : undefined);
  const [applying, setApplying] = useState(false);
  const preview = resume ? buildDiff(resume, levels) : null; // every suggestion, for review
  const diff = resume ? buildDiff(resume, levels, review ? (appliedAt ? (k) => (resume.decisions || {})[k] !== false : () => false) : appliedUse(resume)) : null; // what Final + PDF use
  const qs = resume?.skill_questions || [];
  const unanswered = qs.filter((q) => levels[q.skill.toLowerCase()] === undefined).length;

  async function answer(skill: string, level: number) {
    const next = [...mine.filter((s) => s.name.toLowerCase() !== skill.toLowerCase()), { name: skill, level, from_job: company }];
    setMine(next);
    setEditing((e) => ({ ...e, [skill]: false }));
    await fetch("/api/profile", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ skills: next }) });
  }
  async function copy(t: string) {
    toast.show((await copyText(t)) ? "Copied" : "Select the text to copy it");
  }

  const [clean, setClean] = useState(false);
  const keys = [...new Set((preview?.right || []).filter((r) => r.kind === "add" && r.key).map((r) => r.key!))];
  const kept = keys.filter((k) => decisions[k] !== false).length;
  const dirty = !appliedAt || keys.some((k) => (decisions[k] !== false) !== ((resume?.decisions || {})[k] !== false));
  const marks: Record<number, DocMark> = {};
  preview?.right.forEach((r, i) => {
    if (r.kind !== "add") return;
    const k = r.key;
    marks[i] = {
      old: r.reworded ? preview.left[i]?.text : undefined,
      reason: r.reason || (r.skills ? "Skills you said you've used" : undefined),
      off: !!k && decisions[k] === false,
      extra: review && k ? (
        <div className="rkeep noprint">
          <button type="button" aria-pressed={decisions[k] !== false} onClick={() => setDecisions({ ...decisions, [k]: true })}>✓ Keep</button>
          <button type="button" aria-pressed={decisions[k] === false} onClick={() => setDecisions({ ...decisions, [k]: false })}>✕ Drop</button>
        </div>
      ) : undefined,
    };
  });
  const changed = review ? keys.length : Object.keys(marks).length;

  async function apply() {
    setApplying(true);
    const r = await fetch(`/api/jobs/${jobId}/resume-plan`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "apply", decisions }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    if (d.resume) { setResume(d.resume); setAppliedAt(d.resume.applied_at); toast.show(`Applied ${kept} ${kept === 1 ? "change" : "changes"}`); }
    else toast.show("Couldn't apply just now. Try again.");
    setApplying(false);
  }

  // Gap questions: the student's own rough answers become new facts (saved for every job) and a fresh rewrite.
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [skipped, setSkipped] = useState<Record<string, boolean>>({});
  const [rewriting, setRewriting] = useState(false);
  const gaps = (resume?.gaps || []).filter((g) => !skipped[g.id]);
  const ready = gaps.filter((g) => (answers[g.id] || "").trim().length >= 10);
  async function rewrite() {
    setRewriting(true);
    const r = await fetch(`/api/jobs/${jobId}/resume-plan`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "answers", answers: ready.map((g) => ({ q: g.question, a: answers[g.id] })) }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    if (d.resume) { setResume(d.resume); setDecisions({}); setAppliedAt(undefined); setAnswers({}); toast.show("Rewritten with your answers. Review the new changes below."); }
    else toast.show("Couldn't rewrite just now. Try again in a minute.");
    setRewriting(false);
  }
  return (
    <>
      <Header signedIn initial={initial} />
      <main className="wrap xwide">
        <BackLink href={`/jobs/${jobId}`}>Back to {company}</BackLink>
        <div style={{ marginTop: 8, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: "clamp(30px,4vw,36px)", lineHeight: 1.1, fontWeight: 700, letterSpacing: "-.03em" }}>Your resume for {company}</h1>
            <p className="mute" style={{ margin: "8px 0 0", fontSize: 16 }}>This copy is just for {company}. Your main resume doesn&apos;t change.</p>
          </div>
          {diff && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
              <PdfButton lines={diff?.final.filter((l) => l.trim())} company={company} source={`/api/jobs/${jobId}/resume-lines`} className={`btn ${review && !appliedAt ? "sec" : "lg pri"}`}>{Icon.download()}{review && !appliedAt ? "Download without changes" : "Download PDF"}</PdfButton>
              <span style={{ fontSize: 14, fontWeight: review && !appliedAt ? 600 : 400, color: review && !appliedAt ? "var(--ink)" : "var(--mute)" }}>{review && !appliedAt ? "Apply your changes below to include them" : unanswered ? `${unanswered} skill ${unanswered === 1 ? "question" : "questions"} below` : "Saved here. Come back any time."}</span>
            </div>
          )}
        </div>

        {!hasResume || !resume ? (
          <>
            {!hasResume && <ResumeUpload signedIn />}
            {hasResume && !resume && (
              <div className="card" style={{ marginTop: 12, padding: 24 }}>
                <h2 className="h2" style={{ fontSize: 18 }}>You added your resume after this job</h2>
                <p className="mute" style={{ fontSize: 16, lineHeight: 1.5 }}>When we looked at {company}, we didn&apos;t have your resume yet, so there are no resume changes for it. Tap below and we&apos;ll redo it with your resume.</p>
                <button className="btn dark" onClick={async () => { await fetch(`/api/jobs/${jobId}/redo`, { method: "POST" }); location.href = `/jobs/${jobId}`; }}>Redo with my resume</button>
                <p style={{ fontSize: 14, color: "var(--green)", fontWeight: 600 }}>This doesn&apos;t use another free search.</p>
              </div>
            )}
          </>
        ) : (
          <>
            {review && (
              <div className="card" role="status" style={{ marginTop: 24, padding: "18px 22px", display: "flex", gap: 12, alignItems: "flex-start", ...(appliedAt && !dirty ? { background: "var(--green-bg)", color: "#1A6B3C" } : { background: "#E7EFFA", color: "#164A88" }) }}>
                <span style={{ fontWeight: 700, fontSize: 20, lineHeight: 1 }}>{appliedAt && !dirty ? "✓" : "i"}</span>
                <span style={{ fontSize: 16, lineHeight: 1.5 }}>
                  {changed === 0 ? <><b>No changes suggested.</b> Answer the questions below and we&apos;ll rewrite it with what you tell us.</>
                    : appliedAt && !dirty ? <><b>Applied {kept} of {changed} changes.</b> Final and Download PDF use them. You can still keep or drop any change and apply again.</>
                    : <><b>We suggested {changed} {changed === 1 ? "change" : "changes"} for {company}.</b> Keep or drop each one in your resume below, then tap <b>Apply changes</b>. Nothing changes on your resume until you do.</>}
                </span>
              </div>
            )}

            {(resume.priorities?.length ?? 0) > 0 && (
              <section className="card" style={{ marginTop: 24, padding: 24 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>What {company} is really looking for</h2>
                <p className="mute" style={{ margin: "6px 0 0", fontSize: 16 }}>Read from the job post, with your proof for each. The changes below tell your real work in this language.</p>
                {resume.priorities!.map((p, i) => (
                  <div key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap", padding: "14px 0", borderTop: i ? "1px solid var(--line)" : undefined, marginTop: i ? 0 : 10 }}>
                    <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 700 }}>{p.need}</div>
                      <div className="mute" style={{ fontSize: 14, marginTop: 2 }}>{p.proof || "Nothing on your resume shows this yet."}</div>
                    </div>
                    <span className="tag" style={p.strength === "strong" ? { background: "var(--green-bg)", color: "#1A6B3C" } : p.strength === "weak" ? { background: "#EEF1F5", color: "var(--ink)" } : { background: "#FFEFB0", color: "#4F3E00" }}>{p.strength === "strong" ? "✓ Strong proof" : p.strength === "weak" ? "Some proof" : "⚠ Not shown yet"}</span>
                  </div>
                ))}
              </section>
            )}

            {gaps.length > 0 && (
              <section className="card" style={{ marginTop: 16, padding: 24 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Make it stronger: {gaps.length} {gaps.length === 1 ? "question" : "questions"}</h2>
                <p className="mute" style={{ margin: "6px 0 0", fontSize: 16 }}>Your resume doesn&apos;t show these yet. If you&apos;ve done anything like it, write it your way, in a few rough lines. We&apos;ll add it in the job&apos;s language and remember it for every job.</p>
                {gaps.map((g, i) => (
                  <div key={g.id} style={{ padding: "16px 0", borderTop: i ? "1px solid var(--line)" : undefined, marginTop: i ? 0 : 10 }}>
                    <label htmlFor={`gap-${g.id}`} style={{ display: "block", fontSize: 16, fontWeight: 600 }}>{g.question}</label>
                    {g.why && <div className="mute" style={{ fontSize: 14, marginTop: 2 }}>{g.why}</div>}
                    <textarea id={`gap-${g.id}`} className="ta" rows={3} maxLength={800} style={{ marginTop: 10 }} value={answers[g.id] || ""} onChange={(e) => setAnswers({ ...answers, [g.id]: e.target.value })} placeholder="Write it your way, in a few rough lines. Numbers help." />
                    <button className="btn ghost" style={{ marginTop: 4 }} onClick={() => setSkipped({ ...skipped, [g.id]: true })}>No, skip this</button>
                  </div>
                ))}
                <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <button className="btn dark" disabled={!ready.length || rewriting} aria-busy={rewriting} onClick={rewrite} style={!ready.length ? { opacity: .45, cursor: "not-allowed" } : undefined}>
                    {rewriting ? <><Spinner size={16} />Rewriting your resume…</> : "Rewrite with my answers"}
                  </button>
                  <span className="mute" style={{ fontSize: 14 }}>{rewriting ? "About 30 seconds." : ready.length ? `${ready.length} ${ready.length === 1 ? "answer" : "answers"} ready. Your answers are saved to your profile.` : "Answer at least one to rewrite."}</span>
                </div>
              </section>
            )}

            {qs.length > 0 && (
              <section className="card" style={{ marginTop: 24, padding: 24 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{unanswered ? `${unanswered} quick question${unanswered > 1 ? "s" : ""}` : "Your skill answers"}</h2>
                <p className="mute" style={{ margin: "6px 0 0", fontSize: 16 }}>The job asks for these, or people in this same role at {company} use them. They&apos;re not on your resume, so we won&apos;t add any unless you say you&apos;ve used it in at least a project. Your answers are saved in your account under Skills.</p>
                {qs.map((q, i) => {
                  const lv = levels[q.skill.toLowerCase()];
                  const open = lv === undefined || editing[q.skill];
                  return (
                    <div key={q.skill} id={`q-${q.skill}`} style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", padding: "16px 0", borderTop: i ? "1px solid var(--line)" : undefined, marginTop: i ? 0 : 10 }}>
                      <div style={{ flex: "1 1 220px", fontSize: 16, fontWeight: 600 }}>Have you used {q.skill}?<span className="mute" style={{ display: "block", fontSize: 14, fontWeight: 400, marginTop: 2 }}>{q.why}</span></div>
                      {open ? (
                        <div role="radiogroup" aria-label={q.skill} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {SKILL_LEVELS.map((label, lvl) => <button key={lvl} className="opt" role="radio" aria-checked={lv === lvl} onClick={() => answer(q.skill, lvl)}>{label}</button>)}
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 16 }}>
                          <span style={{ fontWeight: 700, color: ADDS_TO_RESUME(lv) ? "#1A6B3C" : "var(--mute)" }}>{SKILL_LEVELS[lv]} · {ADDS_TO_RESUME(lv) ? "added to your resume" : "not added"}</span>
                          <button className="btn sec" style={{ minHeight: 36, fontSize: 14 }} onClick={() => setEditing((e) => ({ ...e, [q.skill]: true }))}>Change</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>
            )}

            <section className="card" style={{ marginTop: 24, padding: "20px 16px 24px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: "0 8px 16px" }}>
                <div style={{ minWidth: 0 }}>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Your resume for {company}</h2>
                  <p className="mute" style={{ margin: "4px 0 0", fontSize: 14 }}>{clean ? (review && !appliedAt ? "Nothing applied yet: this is your resume as it is. The PDF looks exactly like this." : "This is exactly what the PDF looks like.") : review ? `${changed} suggested ${changed === 1 ? "change" : "changes"}, in green, with the old line crossed out under it. Keep or drop each one.` : `${changed} ${changed === 1 ? "line" : "lines"} changed, in green. The old line is crossed out under it.`}</p>
                </div>
                <div role="radiogroup" aria-label="View" style={{ display: "flex", gap: 6 }}>
                  <button className="opt" role="radio" aria-checked={!clean} onClick={() => setClean(false)}>Show changes</button>
                  <button className="opt" role="radio" aria-checked={clean} onClick={() => setClean(true)}>Final</button>
                </div>
              </div>
              {review && !clean && changed > 0 && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: "0 8px 14px" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{kept} of {changed} kept</span>
                    <button className="btn sec" style={{ minHeight: 36, fontSize: 14 }} onClick={() => setDecisions(Object.fromEntries(keys.map((k) => [k, true])))}>Keep all</button>
                    <button className="btn sec" style={{ minHeight: 36, fontSize: 14 }} onClick={() => setDecisions(Object.fromEntries(keys.map((k) => [k, false])))}>Drop all</button>
                  </div>
                  <button className={dirty ? "btn lg pri" : "btn lg sec"} disabled={applying || !dirty} aria-busy={applying} onClick={apply}>
                    {applying ? <><Spinner size={16} />Applying…</> : dirty ? `Apply ${kept} ${kept === 1 ? "change" : "changes"}` : "✓ Applied"}
                  </button>
                </div>
              )}
              <div style={{ background: "var(--bg)", borderRadius: 20, padding: "20px 12px" }}>
                <ResumeDoc lines={clean ? diff!.final : preview!.final} marks={clean ? undefined : marks} onCopy={copy} />
              </div>
            </section>

            {resume.suggestions?.length > 0 && (
              <section className="card" style={{ marginTop: 16, padding: 24 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Suggestions</h2>
                <p className="mute" style={{ margin: "6px 0 0", fontSize: 16 }}>Ideas for this job. We didn&apos;t make these changes, because only you know if they&apos;re true for you.</p>
                {resume.suggestions.map((s, i) => (
                  <div key={i} style={{ padding: "14px 0", borderTop: i ? "1px solid var(--line)" : undefined, display: "flex", flexDirection: "column", gap: 4 }}>
                    <b style={{ fontSize: 16 }}>{s.title}</b><span className="mute" style={{ fontSize: 16 }}>{s.why}</span>
                  </div>
                ))}
              </section>
            )}
            {portal !== "naukri" && (
              <div className="card" style={{ marginTop: 16, padding: "18px 20px", background: "#E7EFFA", color: "#164A88", fontSize: 16, lineHeight: 1.5 }}>
                <b>Applying with LinkedIn Easy Apply?</b> It sends the old resume saved in your LinkedIn account. When you apply, tap <b>Upload resume</b> and choose this new PDF instead.
              </div>
            )}
          </>
        )}
      </main>
      {toast.el}
    </>
  );
}
