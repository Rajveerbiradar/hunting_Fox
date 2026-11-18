import { NextResponse } from "next/server";
import { currentUser, userClient } from "@/lib/supabase/clients";
import { finalLines } from "@/lib/resumeDiff";

export const dynamic = "force-dynamic";

/** The job's final resume lines + file name. The browser turns them into the PDF (PdfButton). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  const sb = await userClient();
  const [{ data: job }, { data: report }, { data: profile }] = await Promise.all([
    sb.from("jobs").select("company").eq("id", id).maybeSingle(),
    sb.from("reports").select("resume").eq("job_id", id).maybeSingle(),
    sb.from("profiles").select("name,skills,resume_text,resume_profile").eq("id", user.id).single(),
  ]);
  if (!job) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const levels = Object.fromEntries((profile?.skills || []).map((s: { name: string; level: number }) => [s.name.toLowerCase(), s.level]));
  const lines = report?.resume ? finalLines(report.resume, levels) : (profile?.resume_text || "").split("\n");
  return NextResponse.json({ lines: lines.filter((l: string) => l.trim()), name: profile?.resume_profile?.name || profile?.name || "", company: job.company || "" });
}
