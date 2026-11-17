import { NextResponse } from "next/server";
import { adminClient, currentUser } from "@/lib/supabase/clients";
import { access } from "@/lib/limits";
import { writePerson } from "@/lib/pipeline/run";
import type { Person } from "@/lib/pipeline/types";

export const maxDuration = 60;

/** Writes messages for the people after the top 2, only when the student taps "Show 2 more people". */
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
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
    resumeLink: `${(process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "")}/r/${report?.share_token}`,
    portfolio: (profile?.links || [])[0]?.url,
  };
  const updated = await Promise.all(people.map((p) => (p.written ? p : writePerson(p, ctx, profile?.resume_profile || null))));
  await sb.from("reports").update({ people: updated }).eq("job_id", id);
  return NextResponse.json({ people: updated });
}
