import { NextResponse } from "next/server";
import { adminClient, currentUser, userClient } from "@/lib/supabase/clients";
import { makeResume, type Fact } from "@/lib/pipeline/resume";
import { ownKeys } from "@/lib/ownKeys";
import type { ResumePart } from "@/lib/pipeline/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * The resume review on /jobs/[id]/resume.
 *  { action: "apply", decisions: { [key]: boolean } } → lock in the kept suggestions (Final + PDF use them).
 *  { action: "answers", answers: [{ q, a }] }        → save the student's answers to their profile (profiles.facts,
 *                                                       reused for every job) and rewrite the suggestions with them.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  const own = await userClient();
  const { data: job } = await own.from("jobs").select("id").eq("id", id).maybeSingle();
  if (!job) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const sb = adminClient();
  const { data: report } = await sb.from("reports").select("resume,job_data").eq("job_id", id).single();
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

  if (b.action === "answers") {
    const answers: Fact[] = (Array.isArray(b.answers) ? b.answers : [])
      .map((x: Fact) => ({ q: String(x?.q || "").trim().slice(0, 300), a: String(x?.a || "").trim().slice(0, 800), at: new Date().toISOString() }))
      .filter((x: Fact) => x.q && x.a.length >= 10)
      .slice(0, 6);
    if (!answers.length) return NextResponse.json({ error: "no_answers" }, { status: 400 });
    const { data: profile } = await sb.from("profiles").select("*").eq("id", user.id).single();
    const facts: Fact[] = [...(Array.isArray(profile?.facts) ? profile.facts : []).filter((f: Fact) => !answers.some((a) => a.q.toLowerCase() === f.q.toLowerCase())), ...answers].slice(-40);
    await sb.from("profiles").update({ facts }).eq("id", user.id);
    const lines: string[] = (profile?.resume_text || "").split("\n").filter((l: string) => l.trim());
    const keys = await ownKeys(user.id).catch(() => ({ ai: null }));
    const next = await makeResume(lines, { ...profile, facts }, report!.job_data, keys.ai);
    if (!next) return NextResponse.json({ error: "ai_failed" }, { status: 503 });
    await sb.from("reports").update({ resume: next }).eq("job_id", id);
    return NextResponse.json({ resume: next });
  }

  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}
