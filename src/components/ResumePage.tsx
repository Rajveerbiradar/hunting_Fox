"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { BackLink, Header, Icon, copyText, useToast } from "./ui";
import { ResumeUpload } from "./ResumeUpload";
import { buildDiff, type DiffLine } from "@/lib/resumeDiff";
import { ADDS_TO_RESUME, SKILL_LEVELS } from "@/lib/status";

type Skill = { name: string; level: number; from_job?: string };
type R = { base_lines: string[]; edits: { old: string; new: string; reason: string }[]; skill_questions: { skill: string; why: string }[]; suggestions: { title: string; why: string }[] };

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
  function jump(skill: string) {
    setEditing((e) => ({ ...e, [skill]: true }));
    document.getElementById(`q-${skill}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  async function copy(t: string) {
    toast.show((await copyText(t)) ? "Copied" : "Select the text to copy it");
  }

  const Chips = () => (
    <span style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
      {qs.map((q) => {
        const lv = levels[q.skill.toLowerCase()];
        if (lv === undefined) return <button key={q.skill} onClick={() => jump(q.skill)} style={{ minHeight: 30, padding: "0 10px", borderRadius: 12, border: "1.5px dashed #6B7280", background: "transparent", fontSize: 14, fontWeight: 700, color: "var(--mute)", cursor: "pointer" }}>{q.skill} ?</button>;
        const yes = ADDS_TO_RESUME(lv);
        return <span key={q.skill} className="tag" style={yes ? { background: "var(--green-bg)", color: "#1A6B3C", minHeight: 30 } : { background: "#EEF1F5", color: "var(--mute2)", textDecoration: "line-through", minHeight: 30 }}>{q.skill}{yes ? " ✓" : " · not added"}</span>;
      })}
    </span>
  );

  const Line = ({ l, copyable }: { l: DiffLine; copyable?: boolean }) =>
    l.kind === "head" ? <div className="ln h">{l.text}</div> : (
      <div className={`ln ${l.kind === "ctx" ? "" : l.kind}`}>
        <span className="sg">{l.kind === "del" ? "−" : l.kind === "add" ? "+" : ""}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          {l.text}
          {l.reworded && <span title={l.reason} style={{ marginLeft: 8, fontSize: 12, fontWeight: 700, color: "var(--mute)", background: "#fff", padding: "2px 8px", borderRadius: 8 }}>rewritten from your resume</span>}
          {l.skills && unanswered > 0 && <Chips />}
          {l.reworded && l.reason && <span className="mute" style={{ display: "block", fontSize: 14, marginTop: 2 }}>{l.reason}</span>}
        </span>
        {copyable && l.kind === "add" && <button className="cbtn" onClick={() => copy(l.text)} aria-label="Copy line">Copy</button>}
      </div>
    );

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
            {qs.length > 0 && (
              <section className="card" style={{ marginTop: 24, padding: 24 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{unanswered ? `${unanswered} quick question${unanswered > 1 ? "s" : ""}` : "Your skill answers"}</h2>
                <p className="mute" style={{ margin: "6px 0 0", fontSize: 16 }}>People on this team list these skills. We only add one if you&apos;ve at least used it in a project. Your answers are saved in your account under Skills.</p>
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

            <p className="mute" style={{ margin: "24px 8px 0", fontSize: 16 }}>
              <span style={{ color: "#B8132F", fontWeight: 700 }}>Red</span> lines are removed. <span style={{ color: "#1A6B3C", fontWeight: 700 }}>Green</span> lines are new. Tap <b>Copy</b> to paste a line into your own resume, or just download the PDF.
            </p>
            <div className="two" style={{ marginTop: 12 }}>
              <section className="card" style={{ padding: "22px 18px" }}><div className="lbl" style={{ padding: "0 10px 10px" }}>Before</div>{diff!.left.map((l, i) => <Line key={i} l={l} />)}</section>
              <section className="card" style={{ padding: "22px 18px" }}><div className="lbl" style={{ padding: "0 10px 10px", color: "#1A6B3C" }}>After, for {company}</div>{diff!.right.map((l, i) => <Line key={i} l={l} copyable />)}</section>
            </div>
            <section className="card one" style={{ marginTop: 12, padding: "18px 12px" }}>
              <div className="lbl" style={{ padding: "0 10px 10px" }}>Your resume, changed for {company}</div>
              {diff!.unified.map((l, i) => <Line key={i} l={l} copyable />)}
            </section>
            {resume.edits.length === 0 && !diff!.addedSkills.length && <p className="mute" style={{ margin: "12px 8px" }}>Your resume already fits this job well, so we didn&apos;t change any lines.</p>}

            {resume.suggestions?.length > 0 && (
              <section className="card" style={{ marginTop: 16, padding: 24 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Suggestions</h2>
                <p className="mute" style={{ margin: "6px 0 0", fontSize: 16 }}>Ideas from the people we found at {company}. We didn&apos;t make these changes, because only you know if they&apos;re true for you.</p>
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
