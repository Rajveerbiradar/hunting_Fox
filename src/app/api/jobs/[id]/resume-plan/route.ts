import { NextResponse, after } from "next/server";
import { jobCtx } from "@/lib/joblog";
import { adminClient, currentUser, userClient } from "@/lib/supabase/clients";
import { makeResume, type Fact } from "@/lib/pipeline/resume";
import { ownKeys } from "@/lib/ownKeys";
import type { ResumePart } from "@/lib/pipeline/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * The resume review on /jobs/[id]/resume.
 *  { action: "apply", decisions: { [key]: boolean } } → lock in the kept suggestions (Final + PDF use them).
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

  if (b.action === "answers" || b.action === "redo") {
    const r = report?.resume as ResumePart | null;
    const { data: profile } = await sb.from("profiles").select("*").eq("id", user.id).single();
    const lines: string[] = (profile?.resume_text || "").split("\n").filter((l: string) => l.trim());
    if (!lines.length) return NextResponse.json({ error: "no_resume" }, { status: 400 });
    let facts: Fact[] = Array.isArray(profile?.facts) ? profile.facts : [];
    if (b.action === "answers") {
      const answers: Fact[] = (Array.isArray(b.answers) ? b.answers : [])
        .map((x: Fact) => ({ q: String(x?.q || "").trim().slice(0, 300), a: String(x?.a || "").trim().slice(0, 800), at: new Date().toISOString() }))
        .filter((x: Fact) => x.q && x.a.length >= 10)
        .slice(0, 6);
      if (!answers.length) return NextResponse.json({ error: "no_answers" }, { status: 400 });
      facts = [...facts.filter((f) => !answers.some((a) => a.q.toLowerCase() === f.q.toLowerCase())), ...answers].slice(-40);
      await sb.from("profiles").update({ facts }).eq("id", user.id);
    }
    // Saved on the server first, so the student can leave: coming back shows "Rewriting…" until it's done.
    const base = { ...(r || { base_lines: lines, edits: [], skill_questions: [], suggestions: [], v: 2 as const }), rewrite_error: undefined };
    const busy = { ...base, rewriting: { at: new Date().toISOString(), kind: b.action as "answers" | "redo" } };
    await sb.from("reports").update({ resume: busy }).eq("job_id", id);
    const keys = await ownKeys(user.id).catch(() => ({ ai: null }));
    after(async () => {
      await jobCtx.run({ jobId: id, started: Date.now() }, async () => {
        const next = await makeResume(lines, { ...profile, facts }, report!.job_data, keys.ai, report?.company_data).catch(() => null);
        const ok = next && !next.failed;
        // A failed rewrite keeps the old suggestions and says why; a failed retry stays failed.
        const save = ok ? next : { ...base, rewriting: undefined, rewrite_error: next?.failed || "The AI didn't answer", failed: b.action === "redo" ? next?.failed || base.failed || "unknown" : base.failed };
        await sb.from("reports").update({ resume: save }).eq("job_id", id);
      });
    });
    return NextResponse.json({ resume: busy }, { status: 202 });
  }

  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}
