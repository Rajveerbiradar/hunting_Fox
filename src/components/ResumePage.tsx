"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Header, Icon, copyText, useToast } from "./ui";
import { ResumeUpload } from "./ResumeUpload";
import { appliedUse, buildDiff } from "@/lib/resumeDiff";
import { Spinner } from "./ui";
import { CompareDoc, ResumeDoc, type CompareRow, type DocMark } from "./ResumeDoc";
import { PdfButton } from "./PdfButton";
import { ADDS_TO_RESUME, SKILL_LEVELS } from "@/lib/status";

type Skill = { name: string; level: number; from_job?: string };
type R = {
  base_lines: string[]; edits: { old: string; new: string; reason: string; group?: string }[]; skill_questions: { skill: string; why: string }[];
  suggestions: { title: string; why: string }[]; summary_insert?: { text: string; reason: string };
  v?: 2; applied?: boolean; applied_at?: string; decisions?: Record<string, boolean>;
  priorities?: { need: string; proof: string; strength: "strong" | "weak" | "none" }[];
  gaps?: { id: string; question: string; why: string }[];
  failed?: string;
  company_brief?: { believes: string; building: string; deliver: string };
  rewriting?: { at: string; kind: "answers" | "redo" };
  main_before?: string; made_main_at?: string;
  answered?: { q: string; a: string }[]; drafts?: Record<string, string>;
  rewrite_error?: string;
};

export function ResumePage({ jobId, company, resume: start, hasResume, skills, initial, portal, answered = [] }: { jobId: string; company: string; resume: R | null; hasResume: boolean; skills: Skill[]; initial: string; portal: string; answered?: { q: string; a: string }[] }) {
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
  // Keep / Drop only change this list (saved when the student taps Apply); say so on every press.
  // Every change starts kept; the only choice is to drop one (and undo that). The row itself shows the state.
  const decide = (k: string, keep: boolean) => setDecisions({ ...decisions, [k]: keep });
  const marks: Record<number, DocMark> = {};
  preview?.right.forEach((r, i) => {
    if (r.kind !== "add") return;
    const k = r.key;
    marks[i] = {
      old: r.reworded ? preview.left[i]?.text : undefined,
      reason: r.reason || (r.skills ? "Skills you said you've used" : undefined),
      off: !!k && decisions[k] === false,
      extra: review && k ? (
        decisions[k] === false
          ? <button type="button" className="rcico undo" aria-label="Bring this change back" title="Bring this change back" onClick={() => decide(k, true)}>↺</button>
          : <button type="button" className="rcico x" aria-label="Drop this change" title="Drop this change" onClick={() => decide(k, false)}>✕</button>
      ) : undefined,
    };
  });
  const changed = review ? keys.length : Object.keys(marks).length;
  // Left = the resume as it is, right = this job's version, one row per line so changes line up.
  const asLine = (d?: { kind: string; text: string }) => (!d ? "" : d.kind === "head" ? `## ${d.text}` : d.text);
  const rows: CompareRow[] = (preview?.right || []).map((r, i) => {
    const l = preview!.left[i];
    return { left: asLine(l), right: asLine(r), changed: r.kind === "add" || l?.kind === "del", mark: marks[i] };
  });
  // The AI's answer never arrived (or was empty): never show that as "already fits".
  const broke = review && !!resume && (!!resume.failed || (!resume.edits.length && !resume.priorities?.length && !resume.summary_insert));
  // Try again and Rewrite with my answers run on the server. The page shows "Rewriting…" (even after leaving
  // and coming back) and checks every 3 s until the new suggestions are saved.
  const rw = resume?.rewriting;
  const busy = !!rw && Date.now() - new Date(rw.at).getTime() < 5 * 60_000;
  useEffect(() => {
    if (!busy) return;
    let alive = true;
    const t = setInterval(async () => {
      const r = await fetch(`/api/jobs/${jobId}/resume-plan`, { cache: "no-store" }).catch(() => null);
      const d = r && r.ok ? await r.json().catch(() => null) : null;
      if (!alive || !d?.resume || d.resume.rewriting) return;
      setResume(d.resume);
      setDecisions(d.resume.decisions || {});
      setAppliedAt(d.resume.applied ? d.resume.applied_at : undefined);
      toast.show(d.resume.rewrite_error ? "Couldn't rewrite it this time. Try again." : "Done. Review the new changes below.");
    }, 3000);
    return () => { alive = false; clearInterval(t); };
  }, [busy, jobId]); // eslint-disable-line react-hooks/exhaustive-deps
  async function startRewrite(body: object) {
    const r = await fetch(`/api/jobs/${jobId}/resume-plan`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    if (d.resume?.rewriting) {
      const sent = (body as { answers?: { q: string; a: string }[] }).answers || [];
      if (sent.length) setDone((x) => [...x.filter((f) => !sent.some((s) => s.q === f.q)), ...sent]);
      setResume(d.resume); setAnswers({});
    }
    else toast.show("Couldn't start just now. Try again in a minute.");
  }
  const redo = () => startRewrite({ action: "redo" });

  // "Make this my main resume": replaces the student's main resume with this job's final version. Asks first, on the page.
  const [askMain, setAskMain] = useState(false);
  async function makeMain(undo = false) {
    const r = await fetch(`/api/jobs/${jobId}/resume-plan`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: undo ? "undo_main" : "make_main" }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    if (d.resume) { setResume(d.resume); setAskMain(false); toast.show(undo ? "Your old main resume is back" : "This is now your main resume"); }
    else toast.show("Couldn't do that just now. Try again.");
  }

  async function apply() {
    setApplying(true);
    const r = await fetch(`/api/jobs/${jobId}/resume-plan`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "apply", decisions }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    if (d.resume) { setResume(d.resume); setAppliedAt(d.resume.applied_at); toast.show(`Applied ${kept} ${kept === 1 ? "change" : "changes"}`); }
    else toast.show("Couldn't apply just now. Try again.");
    setApplying(false);
  }

  // Gap questions: the student's own rough answers become new facts (saved for every job) and a fresh rewrite.
  // Typed answers come back after a refresh: saved on the server as you type (a second after you stop).
  const [answers, setAnswers] = useState<Record<string, string>>(start?.drafts || {});
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function type(id: string, text: string) {
    const next = { ...answers, [id]: text };
    setAnswers(next);
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => { void fetch(`/api/jobs/${jobId}/resume-plan`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "draft", drafts: next }) }).catch(() => null); }, 1000);
  }
  const [skipped, setSkipped] = useState<Record<string, boolean>>({});
  // Questions already answered (saved on the profile, also from other jobs) never come back as empty boxes.
  const [done, setDone] = useState<{ q: string; a: string }[]>([...(start?.answered || []), ...answered]);
  const isDone = (q: string) => done.some((f) => f.q.trim().toLowerCase() === q.trim().toLowerCase());
  const gaps = (resume?.gaps || []).filter((g) => !skipped[g.id] && !isDone(g.question));
  // Everything answered for this job stays listed, even when a rewrite asks new questions.
  const doneHere = [...new Map([...(resume?.answered || []), ...(resume?.gaps || []).map((g) => done.find((f) => f.q.trim().toLowerCase() === g.question.trim().toLowerCase())).filter(Boolean) as { q: string; a: string }[]].map((f) => [f.q, f])).values()];
  const ready = gaps.filter((g) => (answers[g.id] || "").trim().length >= 10);
  const rewrite = () => startRewrite({ action: "answers", answers: ready.map((g) => ({ q: g.question, a: answers[g.id] })) });
  return (
    <>
      <Header signedIn initial={initial} back={{ href: `/jobs/${jobId}`, label: `Back to ${company}` }} />
      <main className="wrap xwide">
        <div style={{ marginTop: 8, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: "clamp(30px,4vw,36px)", lineHeight: 1.1, fontWeight: 700, letterSpacing: "-.03em" }}>Your resume for {company}</h1>
            <p className="mute" style={{ margin: "8px 0 0", fontSize: 16 }}>This copy is just for {company}. Your main resume doesn&apos;t change.</p>
          </div>
          {diff && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
              <PdfButton lines={diff?.final.filter((l) => l.trim())} company={company} source={`/api/jobs/${jobId}/resume-lines`} className={`btn ${review && !appliedAt ? "sec" : "lg pri"}`}>{Icon.download()}{review && !appliedAt ? "Download without changes" : "Download PDF"}</PdfButton>
              <span style={{ fontSize: 14, fontWeight: review && !appliedAt ? 600 : 400, color: review && !appliedAt ? "var(--ink)" : "var(--mute)" }}>{review && !appliedAt ? "Apply your changes below to include them" : unanswered ? `${unanswered} skill ${unanswered === 1 ? "question" : "questions"} below` : "Saved here. Come back any time."}</span>
              {resume?.made_main_at ? (
                <span style={{ fontSize: 14, display: "flex", gap: 8, alignItems: "center" }}><b style={{ color: "#1A6B3C" }}>✓ This is your main resume now</b><button className="btn ghost" style={{ minHeight: 32, padding: "0 6px", fontSize: 14 }} onClick={() => makeMain(true)}>Undo</button></span>
              ) : !askMain ? (
                <button className="btn sec" style={{ minHeight: 36, fontSize: 14 }} disabled={review && !appliedAt} title={review && !appliedAt ? "Apply your changes first" : undefined} onClick={() => setAskMain(true)}>Make this my main resume</button>
              ) : null}
            </div>
          )}
        </div>

        {askMain && !resume?.made_main_at && (
          <div className="card" role="dialog" aria-label="Replace your main resume" style={{ marginTop: 16, padding: "18px 22px", display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", border: "1.5px solid var(--ink)" }}>
            <span style={{ flex: "1 1 320px", fontSize: 16, lineHeight: 1.5 }}><b>Replace your main resume with this version for {company}?</b> Every new job will start from it. You can undo this here.</span>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn dark" onClick={() => makeMain(false)}>Yes, replace it</button>
              <button className="btn sec" onClick={() => setAskMain(false)}>Cancel</button>
            </div>
          </div>
        )}

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
            {/* A rewrite that didn't finish only tells the student when they asked for it (the toast). Opening the
                page never shows an error: the earlier changes stay, or the "not made yet" card below. */}
            {resume.rewrite_error === "budget" && !busy && !broke && (
              <div className="card" role="status" style={{ marginTop: 24, padding: "16px 22px", background: "#EEF1F5", fontSize: 16, lineHeight: 1.5 }}>
                <b>The AI budget allocated to you is finished.</b> <span className="mute">AI credits are separate from your search credits. Hunting Fox is a personal project with a limited budget, so please ask the admin for more AI credits. Your answers are saved.</span>
              </div>
            )}

            {broke && !busy && (
              <div className="card" role="status" style={{ marginTop: 24, padding: "22px 24px" }}>
                <div style={{ fontSize: 18, fontWeight: 700 }}>Your resume isn&apos;t made for {company} yet</div>
                {resume.failed === "budget" ? (
                  <p className="mute" style={{ margin: "6px 0 0", fontSize: 16, lineHeight: 1.5 }}>The AI budget allocated to you is finished, so we can&apos;t rewrite it right now. AI credits are separate from your search credits. Please ask the admin for more. Below is your main resume, which you can download as it is.</p>
                ) : (
                  <>
                    <p className="mute" style={{ margin: "6px 0 14px", fontSize: 16, lineHeight: 1.5 }}>Below is your main resume. Tap the button and we&apos;ll rewrite it in this job&apos;s language, using only what&apos;s true about you. It doesn&apos;t use a search.</p>
                    <button className="btn lg pri" onClick={redo}>Make it for {company}</button>
                  </>
                )}
              </div>
            )}

            {busy && (
              <div className="card" role="status" style={{ marginTop: 24, padding: "18px 22px", display: "flex", gap: 14, alignItems: "center", background: "#E7EFFA", color: "#164A88" }}>
                <Spinner size={20} />
                <span style={{ fontSize: 16, lineHeight: 1.5 }}><b>{rw!.kind === "answers" ? "Rewriting your resume with your answers…" : "Rewriting your resume for " + company + "…"}</b> About a minute. You can leave this page: it keeps going, and the new changes will be here when you come back.</span>
              </div>
            )}

            {review && !broke && !busy && (
              <div className="card" role="status" style={{ marginTop: 24, padding: "18px 22px", display: "flex", gap: 12, alignItems: "flex-start", ...(appliedAt && !dirty ? { background: "var(--green-bg)", color: "#1A6B3C" } : { background: "#E7EFFA", color: "#164A88" }) }}>
                <span style={{ fontWeight: 700, fontSize: 20, lineHeight: 1 }}>{appliedAt && !dirty ? "✓" : "i"}</span>
                <span style={{ fontSize: 16, lineHeight: 1.5 }}>
                  {changed === 0 ? <><b>Your resume already speaks this job&apos;s language.</b> {gaps.length ? "Answer the questions below and we'll make it stronger with what you tell us." : "You can download it as it is."}</>
                    : appliedAt && !dirty ? <><b>Applied {kept} of {changed} changes.</b> Final and Download PDF use them. You can still keep or drop any change and apply again.</>
                    : <><b>We suggested {changed} {changed === 1 ? "change" : "changes"} for {company}.</b> Keep or drop each one in your resume below, then tap <b>Apply changes</b>. Nothing changes on your resume until you do.</>}
                </span>
              </div>
            )}

            {!broke && resume.company_brief && (
              <section className="card" style={{ marginTop: 24, padding: 24 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>What {company} believes, and what you&apos;d bring</h2>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginTop: 14 }}>
                  {[["They believe", resume.company_brief.believes], ["They're building", resume.company_brief.building], ["You'd bring", resume.company_brief.deliver]].filter(([, t]) => t).map(([l, t]) => (
                    <div key={l} style={{ minWidth: 0 }}>
                      <div className="lbl">{l}</div>
                      <div style={{ fontSize: 16, lineHeight: 1.5, marginTop: 4 }}>{t}</div>
                    </div>
                  ))}
                </div>
                <p className="mute" style={{ margin: "12px 0 0", fontSize: 14 }}>Your new summary ends with this, and your messages to people at {company} use it too.</p>
              </section>
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

            {doneHere.length > 0 && (
              <section className="card" style={{ marginTop: 16, padding: "18px 24px" }}>
                <div className="lbl">Your answers{busy ? ", being added to your resume now" : ""}</div>
                {doneHere.map((f, i) => (
                  <div key={i} style={{ padding: "12px 0", borderTop: i ? "1px solid var(--line)" : undefined }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}><span style={{ color: "var(--green)", fontWeight: 700 }}>✓</span><span style={{ fontSize: 16, fontWeight: 600 }}>{f.q}</span></div>
                    <div className="mute" style={{ fontSize: 14, marginTop: 4, marginLeft: 22 }}>{f.a}</div>
                  </div>
                ))}
                <p className="mute" style={{ margin: "6px 0 0", fontSize: 14 }}>Saved to your profile, so we use them for every job.</p>
              </section>
            )}

            {gaps.length > 0 && !busy && (
              <section className="card" style={{ marginTop: 16, padding: 24 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Make it stronger: {gaps.length} {gaps.length === 1 ? "question" : "questions"}</h2>
                <p className="mute" style={{ margin: "6px 0 0", fontSize: 16 }}>Your resume doesn&apos;t show these yet. If you&apos;ve done anything like it, write it your way, in a few rough lines. We&apos;ll add it in the job&apos;s language and remember it for every job.</p>
                {gaps.map((g, i) => (
                  <div key={g.id} style={{ padding: "16px 0", borderTop: i ? "1px solid var(--line)" : undefined, marginTop: i ? 0 : 10 }}>
                    <label htmlFor={`gap-${g.id}`} style={{ display: "block", fontSize: 16, fontWeight: 600 }}>{g.question}</label>
                    {g.why && <div className="mute" style={{ fontSize: 14, marginTop: 2 }}>{g.why}</div>}
                    <textarea id={`gap-${g.id}`} className="ta" rows={3} maxLength={800} style={{ marginTop: 10 }} value={answers[g.id] || ""} onChange={(e) => type(g.id, e.target.value)} placeholder="Write it your way, in a few rough lines. Numbers help." />
                    <button className="btn ghost" style={{ marginTop: 4 }} onClick={() => setSkipped({ ...skipped, [g.id]: true })}>No, skip this</button>
                  </div>
                ))}
                <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <button className={ready.length && !busy ? "btn lg pri" : "btn lg off"} disabled={!ready.length || busy} aria-busy={busy} onClick={rewrite}>
                    {busy ? <><Spinner size={16} />Rewriting your resume…</> : "Rewrite with my answers"}
                  </button>
                  <span className="mute" style={{ fontSize: 14 }}>{busy ? "About a minute. You can leave this page." : ready.length ? `${ready.length} ${ready.length === 1 ? "answer" : "answers"} ready. Your answers are saved to your profile.` : "Answer at least one to rewrite."}</span>
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
                  <p className="mute" style={{ margin: "4px 0 0", fontSize: 14 }}>{clean ? (review && !appliedAt ? "Nothing applied yet: this is your resume as it is. The PDF looks exactly like this." : "This is exactly what the PDF looks like.") : review ? `${changed} suggested ${changed === 1 ? "change" : "changes"}. Your resume now on the left, the version for ${company} on the right. Keep or drop each one.` : `${changed} ${changed === 1 ? "line" : "lines"} changed. Your resume now on the left, the version for ${company} on the right.`}</p>
                </div>
                <div role="radiogroup" aria-label="View" style={{ display: "flex", gap: 6 }}>
                  <button className="opt" role="radio" aria-checked={!clean} onClick={() => setClean(false)}>Show changes</button>
                  <button className="opt" role="radio" aria-checked={clean} onClick={() => setClean(true)}>Final</button>
                </div>
              </div>
              {review && !clean && changed > 0 && !busy && (
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
              <div style={{ position: "relative", background: "var(--bg)", borderRadius: 20, padding: "20px 12px" }} aria-busy={busy}>
                {busy && (
                  <div className="rbusy" role="status">
                    <div className="rbusy-in"><Spinner size={28} /><b>Rewriting your resume for {company}…</b><span>About a minute. The new changes appear here.</span></div>
                  </div>
                )}
                {clean ? <ResumeDoc lines={diff!.final} /> : <CompareDoc rows={rows} leftTitle="Your resume now" rightTitle={`For ${company}`} onCopy={copy} />}
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
