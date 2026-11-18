import { NextResponse } from "next/server";
import { adminClient, currentUser } from "@/lib/supabase/clients";
import { access } from "@/lib/limits";
import { writeMany } from "@/lib/pipeline/run";
import { knownSkills } from "@/lib/pipeline/rules";
import type { Person } from "@/lib/pipeline/types";

export const maxDuration = 300;

/**
 * { ids: [...] }: write those people's messages again ("Write it again").
 * No body: finish anyone still without a message (the page calls this if the background writing stopped).
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
    student: { skills: knownSkills(profile || {}), projects: profile?.resume_profile?.projects, education: (profile?.education?.length ? profile.education : profile?.resume_profile?.education || []).map((e: { school: string }) => e.school) },
  };
  const { ids } = await req.json().catch(() => ({ ids: null }));
  const targets = Array.isArray(ids) ? people.filter((p) => ids.includes(p.id)) : people.filter((p) => !p.written);
  await writeMany(id, targets, ctx, profile?.resume_profile || null);
  const { data: fresh } = await sb.from("reports").select("people").eq("job_id", id).single();
  return NextResponse.json({ people: fresh?.people || people });
}
