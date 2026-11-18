/* eslint-disable @typescript-eslint/no-explicit-any */
import { companyInput } from "@/lib/pipeline/resume";
import { NextResponse } from "next/server";
import { adminClient, currentUser } from "@/lib/supabase/clients";
import { access } from "@/lib/limits";
import { writePerson } from "@/lib/pipeline/run";
import { jlog, jobCtx } from "@/lib/joblog";
import { ownKeys } from "@/lib/ownKeys";
import { knownSkills } from "@/lib/pipeline/rules";
import type { Person } from "@/lib/pipeline/types";

export const maxDuration = 300;

/**
 * Write one person's LinkedIn note and email, when the student asks for it.
 * { ids: [id], notes?: string }: with notes (10–600 characters, what only the student knows) the AI blends them with
 * the person's profile, the job and the resume, notes leading; without notes it writes our suggested message from their profile and the student's resume.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  if (!(await access(user.id, user.email)).approved) return NextResponse.json({ error: "pending" }, { status: 403 });
  const sb = adminClient();
  const { data: job } = await sb.from("jobs").select("user_id,title,company").eq("id", id).single();
  if (!job || job.user_id !== user.id) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const [{ data: report }, { data: profile }] = await Promise.all([
    sb.from("reports").select("*").eq("job_id", id).single(),
    sb.from("profiles").select("*").eq("id", user.id).single(),
  ]);
  const people: Person[] = report?.people || [];
  const ctx = {
    role: job.title,
    company: job.company,
    big: report?.size_band === "big",
    studentName: (profile?.resume_profile?.name || profile?.name || "").replace(/\s*\(.*?\)\s*/g, " ").trim(),
    headline: profile?.resume_profile?.headline,
    resumeLink: profile?.resume_text || profile?.resume_profile ? `${(process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "")}/r/${report?.share_token}` : "",
    portfolio: (profile?.links || [])[0]?.url,
    job: { key_skills: report?.job_data?.keySkills, description: report?.job_data?.description },
    companyInfo: companyInput(report?.company_data, job.company),
    student: { skills: knownSkills(profile || {}), projects: profile?.resume_profile?.projects, resume: (profile?.resume_text || "").split("\n").filter((l: string) => l.trim()), education: (profile?.education?.length ? profile.education : profile?.resume_profile?.education || []).map((e: { school: string }) => e.school) },
  };
  const b = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(b.ids) ? b.ids.slice(0, 1) : [];
  const notes = typeof b.notes === "string" ? b.notes.trim().slice(0, 600) : "";
  if (notes && notes.length < 10) return NextResponse.json({ error: "too_short" }, { status: 400 });
  const targets = people.filter((p) => ids.includes(p.id));
  if (!targets.length) return NextResponse.json({ error: "no_person" }, { status: 400 });
  const target = { ...targets[0], asked: notes || undefined };
  const keys = await ownKeys(user.id).catch(() => ({ ai: null }));
  // One person, asked for by the student: the real AI message or a clear error. Never the plain template.
  // Runs inside the job's log context, so every try (and why it failed) shows in admin → Jobs → Log.
  const t0 = Date.now();
  const result = await jobCtx.run({ jobId: id, started: t0 }, async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error("took over 150 seconds")), 150_000); });
    try {
      const w = await Promise.race([writePerson(target, { ...ctx, studentNotes: notes }, profile?.resume_profile || null, keys.ai, true), late]);
      await jlog("info", "messages", `Wrote ${target.first}'s message${notes ? " with the student's notes" : ""} in ${Math.round((Date.now() - t0) / 1000)}s`);
      return { ok: true as const, person: w };
    } catch (e: any) {
      await jlog("error", "messages", `Couldn't write ${target.first}'s message: ${String(e?.message || e).slice(0, 300)}`);
      return { ok: false as const, reason: String(e?.message || e).slice(0, 160) };
    } finally { clearTimeout(timer); }
  });
  // The student's notes are kept either way, so "Try again" / "Write it again" start from them.
  const { data: r } = await sb.from("reports").select("people").eq("job_id", id).single();
  const list = (r?.people || []).map((x: Person) => (x.id !== target.id ? x : result.ok ? { ...result.person, asked: notes || undefined } : { ...x, asked: notes || undefined }));
  await sb.from("reports").update({ people: list }).eq("job_id", id);
  if (!result.ok) return NextResponse.json({ error: "ai_failed", detail: result.reason, people: list }, { status: 503 });
  const { data: fresh } = await sb.from("reports").select("people").eq("job_id", id).single();
  return NextResponse.json({ people: fresh?.people || people });
}
