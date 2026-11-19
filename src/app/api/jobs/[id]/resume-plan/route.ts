import { NextResponse, after } from "next/server";
import { jlog, jobCtx } from "@/lib/joblog";
import { adminClient, currentUser, userClient } from "@/lib/supabase/clients";
import { makeResume, type Fact } from "@/lib/pipeline/resume";
import { finalLines } from "@/lib/resumeDiff";
import { ownKeys } from "@/lib/ownKeys";
import type { ResumePart } from "@/lib/pipeline/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * The resume review on /jobs/[id]/resume.
 *  { action: "apply", decisions: { [key]: boolean } } → lock in the kept suggestions (Final + PDF use them).
 *  { action: "make_main" | "undo_main" }          → this job's final version becomes (or stops being) the main resume.
 *  { action: "redo" }                               → write the changes again (after a failed try).
 * redo and answers save `rewriting` at once, run in the background (after()), and the page polls GET.
 *  { action: "answers", answers: [{ q, a }] }        → save the student's answers to their profile (profiles.facts,
 *                                                       reused for every job) and rewrite the suggestions with them.
 */
/** The resume part as it is now (the page polls this while a rewrite runs). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  const own = await userClient();
  const { data: job } = await own.from("jobs").select("id").eq("id", id).maybeSingle();
  if (!job) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { data: report } = await adminClient().from("reports").select("resume").eq("job_id", id).single();
  return NextResponse.json({ resume: report?.resume || null });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  const own = await userClient();
  const { data: job } = await own.from("jobs").select("id").eq("id", id).maybeSingle();
  if (!job) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const sb = adminClient();
  const { data: report } = await sb.from("reports").select("resume,job_data,company_data").eq("job_id", id).single();
  const b = await req.json().catch(() => ({}));

  if (b.action === "apply") {
    const r = report?.resume as ResumePart | null;
    if (!r) return NextResponse.json({ error: "no_resume" }, { status: 400 });
    const decisions: Record<string, boolean> = {};
    Object.entries(b.decisions || {}).forEach(([k, v]) => { if (/^(\d{1,2}|s)$/.test(k)) decisions[k] = !!v; });
    const next = { ...r, v: 2 as const, applied: true, applied_at: new Date().toISOString(), decisions };
    await sb.from("reports").update({ resume: next }).eq("job_id", id);
    return NextResponse.json({ resume: next });
  }

  // "Make this my main resume": the student's main resume becomes this job's final version (applied changes +
  // confirmed skills). The old main resume is kept on this job's report, so "Undo" can put it back.
  // What the student is typing into the questions, saved as they type, so a refresh never loses it.
  if (b.action === "draft") {
    const r = report?.resume as ResumePart | null;
    if (!r) return NextResponse.json({ error: "no_resume" }, { status: 400 });
    const drafts: Record<string, string> = {};
    Object.entries(b.drafts || {}).slice(0, 8).forEach(([k, v]) => { if (/^g\d{1,2}$/.test(k) && typeof v === "string" && v.trim()) drafts[k] = v.slice(0, 800); });
    await sb.from("reports").update({ resume: { ...r, drafts } }).eq("job_id", id);
    return NextResponse.json({ ok: true });
  }

  if (b.action === "make_main" || b.action === "undo_main") {
    const r = report?.resume as (ResumePart & { main_before?: string; made_main_at?: string }) | null;
    if (!r) return NextResponse.json({ error: "no_resume" }, { status: 400 });
    const { data: profile } = await sb.from("profiles").select("skills,resume_text,resume_profile").eq("id", user.id).single();
    if (b.action === "undo_main") {
      if (!r.main_before) return NextResponse.json({ error: "nothing_to_undo" }, { status: 400 });
      await sb.from("profiles").update({ resume_text: r.main_before }).eq("id", user.id);
      const next = { ...r, main_before: undefined, made_main_at: undefined };
      await sb.from("reports").update({ resume: next }).eq("job_id", id);
      return NextResponse.json({ resume: next });
    }
    const levels = Object.fromEntries((profile?.skills || []).map((s: { name: string; level: number }) => [s.name.toLowerCase(), s.level]));
    const lines = finalLines(r, levels);
    if (!lines.length) return NextResponse.json({ error: "empty" }, { status: 400 });
    const headline = lines.find((l) => l.startsWith("> "))?.slice(2);
    await sb.from("profiles").update({
      resume_text: lines.join("\n"),
      ...(profile?.resume_profile && headline ? { resume_profile: { ...profile.resume_profile, headline } } : {}),
    }).eq("id", user.id);
    const next = { ...r, main_before: r.main_before ?? profile?.resume_text ?? "", made_main_at: new Date().toISOString() };
    await sb.from("reports").update({ resume: next }).eq("job_id", id);
    return NextResponse.json({ resume: next });
  }

  if (b.action === "answers" || b.action === "redo") {
    const r = report?.resume as ResumePart | null;
    const { data: profile } = await sb.from("profiles").select("*").eq("id", user.id).single();
    const lines: string[] = (profile?.resume_text || "").split("\n").filter((l: string) => l.trim());
    if (!lines.length) return NextResponse.json({ error: "no_resume" }, { status: 400 });
    let facts: Fact[] = Array.isArray(profile?.facts) ? profile.facts : [];
    let answeredHere: Fact[] = [];
    if (b.action === "answers") {
      const answers: Fact[] = (Array.isArray(b.answers) ? b.answers : [])
        .map((x: Fact) => ({ q: String(x?.q || "").trim().slice(0, 300), a: String(x?.a || "").trim().slice(0, 800), at: new Date().toISOString() }))
        .filter((x: Fact) => x.q && x.a.length >= 10)
        .slice(0, 6);
      if (!answers.length) return NextResponse.json({ error: "no_answers" }, { status: 400 });
      facts = [...facts.filter((f) => !answers.some((a) => a.q.toLowerCase() === f.q.toLowerCase())), ...answers].slice(-40);
      const { error: factErr } = await sb.from("profiles").update({ facts }).eq("id", user.id);
      if (factErr) await jlog("error", "resume", `Couldn't save answers to the profile (run supabase/migrations/007_facts.sql?): ${factErr.message}`, id);
      answeredHere = answers;
    }
    // Saved on the server first, so the student can leave: coming back shows "Rewriting…" until it's done.
    const prev = (r as ResumePart & { answered?: Fact[] } | null)?.answered || [];
    const answered = [...prev.filter((p) => !answeredHere.some((a) => a.q === p.q)), ...answeredHere].slice(-20);
    const base = { ...(r || { base_lines: lines, edits: [], skill_questions: [], suggestions: [], v: 2 as const }), rewrite_error: undefined, answered, drafts: {} };
    const busy = { ...base, rewriting: { at: new Date().toISOString(), kind: b.action as "answers" | "redo" } };
    await sb.from("reports").update({ resume: busy }).eq("job_id", id);
    const keys = await ownKeys(user.id).catch(() => ({ ai: null }));
    after(async () => {
      await jobCtx.run({ jobId: id, started: Date.now(), userId: user.id }, async () => {
        const next = await makeResume(lines, { ...profile, facts }, report!.job_data, keys.ai, report?.company_data).catch(() => null);
        const ok = next && !next.failed;
        // A failed rewrite keeps the old suggestions and says why; a failed retry stays failed.
        const save = ok ? { ...next, answered } : { ...base, rewriting: undefined, rewrite_error: next?.failed === "budget" ? "budget" : "ai", failed: b.action === "redo" ? next?.failed || base.failed || "unknown" : base.failed };
        await sb.from("reports").update({ resume: save }).eq("job_id", id);
      });
    });
    return NextResponse.json({ resume: busy }, { status: 202 });
  }

  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}
