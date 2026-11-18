"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { BackLink, Header, Icon, copyText, useToast } from "./ui";
import { ResumeUpload } from "./ResumeUpload";
import { buildDiff } from "@/lib/resumeDiff";
import { ResumeDoc, type DocMark } from "./ResumeDoc";
import { ADDS_TO_RESUME, SKILL_LEVELS } from "@/lib/status";

type Skill = { name: string; level: number; from_job?: string };
type R = { base_lines: string[]; edits: { old: string; new: string; reason: string }[]; skill_questions: { skill: string; why: string }[]; suggestions: { title: string; why: string }[]; keywords?: { term: string; in_resume: boolean }[] };

export function ResumePage({ jobId, company, resume, hasResume, skills, initial, portal }: { jobId: string; company: string; resume: R | null; hasResume: boolean; skills: Skill[]; initial: string; portal: string }) {
  const [mine, setMine] = useState<Skill[]>(skills);
  const [editing, setEditing] = useState<Record<string, boolean>>({});
  const toast = useToast();
  const levels = useMemo(() => Object.fromEntries(mine.map((s) => [s.name.toLowerCase(), s.level])), [mine]);
  const diff = resume ? buildDiff(resume, levels) : null;
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
  const marks: Record<number, DocMark> = {};
  diff?.right.forEach((r, i) => { if (r.kind === "add") marks[i] = { old: r.reworded ? diff.left[i]?.text : undefined, reason: r.reason || (r.skills ? "Skills you said you've used" : undefined) }; });
  const changed = Object.keys(marks).length;

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
              <Link href={`/jobs/${jobId}/resume/print`} target="_blank" className={`btn ${unanswered ? "sec" : "lg pri"}`}>{Icon.download()}{unanswered ? "Download anyway" : "Download PDF"}</Link>
              <span style={{ fontSize: 14, fontWeight: unanswered ? 600 : 400, color: unanswered ? "var(--ink)" : "var(--mute)" }}>{unanswered ? `Answer ${unanswered} ${unanswered === 1 ? "question" : "questions"} below first` : "Saved here. Come back any time."}</span>
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
            {(resume.keywords?.length ?? 0) > 0 && (() => {
              const kws = resume.keywords!.map((k) => ({ ...k, ok: k.in_resume || diff!.addedSkills.some((a) => a.toLowerCase() === k.term.toLowerCase()) }));
              const got = kws.filter((k) => k.ok).length;
              return (
                <section className="card" style={{ marginTop: 24, padding: 24 }}>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Words the job looks for: {got} of {kws.length} on this resume</h2>
                  <p className="mute" style={{ margin: "6px 0 12px", fontSize: 16 }}>Companies filter resumes by the words in the job post. We used the job&apos;s exact words in your real lines. The missing ones are only added if you&apos;ve really used them.</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {kws.map((k) => <span key={k.term} className="tag" style={k.ok ? { background: "var(--green-bg)", color: "#1A6B3C" } : { background: "#EEF1F5", color: "var(--mute)" }}>{k.term}{k.ok ? " ✓" : ""}</span>)}
                  </div>
                </section>
              );
            })()}
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
                  <p className="mute" style={{ margin: "4px 0 0", fontSize: 14 }}>{clean ? "This is exactly what the PDF looks like." : `${changed} ${changed === 1 ? "line" : "lines"} changed, in green. The old line is crossed out under it. Tap Copy to paste a line into your own resume.`}</p>
                </div>
                <div role="radiogroup" aria-label="View" style={{ display: "flex", gap: 6 }}>
                  <button className="opt" role="radio" aria-checked={!clean} onClick={() => setClean(false)}>Show changes</button>
                  <button className="opt" role="radio" aria-checked={clean} onClick={() => setClean(true)}>Final</button>
                </div>
              </div>
              <div style={{ background: "var(--bg)", borderRadius: 20, padding: "20px 12px" }}>
                <ResumeDoc lines={diff!.final} marks={clean ? undefined : marks} onCopy={copy} />
              </div>
            </section>
            {resume.edits.length === 0 && !diff!.addedSkills.length && <p className="mute" style={{ margin: "12px 8px" }}>Your resume already fits this job well, so we didn&apos;t change any lines.</p>}

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
