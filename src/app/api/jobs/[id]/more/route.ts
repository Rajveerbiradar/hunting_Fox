import { companyInput } from "@/lib/pipeline/resume";
import { NextResponse } from "next/server";
import { adminClient, currentUser } from "@/lib/supabase/clients";
import { access } from "@/lib/limits";
import { writeMany } from "@/lib/pipeline/run";
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
    studentName: profile?.name || "",
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
  const done = await writeMany(id, targets.map((t) => ({ ...t, asked: notes || undefined })), { ...ctx, studentNotes: notes }, profile?.resume_profile || null);
  // Keep what the student wrote, so "Write it again" starts from it.
  if (done[0]) {
    const { data: r } = await sb.from("reports").select("people").eq("job_id", id).single();
    const list = (r?.people || []).map((x: Person) => (x.id === done[0].id ? { ...x, asked: notes || undefined } : x));
    await sb.from("reports").update({ people: list }).eq("job_id", id);
  }
  const { data: fresh } = await sb.from("reports").select("people").eq("job_id", id).single();
  return NextResponse.json({ people: fresh?.people || people });
}
