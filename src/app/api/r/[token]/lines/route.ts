import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/clients";
import { finalLines } from "@/lib/resumeDiff";

export const dynamic = "force-dynamic";

/** Lines of a shared resume (/r/[token]), for its Download PDF button. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{18}$/.test(token)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const sb = adminClient();
  const { data: report } = await sb.from("reports").select("job_id,resume").eq("share_token", token).maybeSingle();
  if (!report) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { data: job } = await sb.from("jobs").select("user_id").eq("id", report.job_id).single();
  const { data: profile } = await sb.from("profiles").select("name,skills,resume_text,resume_profile").eq("id", job!.user_id).single();
  const levels = Object.fromEntries((profile?.skills || []).map((s: { name: string; level: number }) => [s.name.toLowerCase(), s.level]));
  const lines = report.resume ? finalLines(report.resume, levels) : (profile?.resume_text || "").split("\n");
  return NextResponse.json({ lines: lines.filter((l: string) => l.trim()), name: profile?.resume_profile?.name || profile?.name || "" });
}
