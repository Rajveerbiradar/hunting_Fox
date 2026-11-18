import { adminClient } from "@/lib/supabase/clients";
import { buildDiff } from "@/lib/resumeDiff";
import { pdfName, resumePdf } from "@/lib/resumePdf";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** PDF of a shared resume link (/r/[token]), for whoever the student sent it to. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{18}$/.test(token)) return new Response("Not found", { status: 404 });
  const sb = adminClient();
  const { data: report } = await sb.from("reports").select("job_id,resume").eq("share_token", token).maybeSingle();
  if (!report) return new Response("Not found", { status: 404 });
  const { data: job } = await sb.from("jobs").select("user_id").eq("id", report.job_id).single();
  const { data: profile } = await sb.from("profiles").select("name,skills,resume_text,resume_profile").eq("id", job!.user_id).single();
  const levels = Object.fromEntries((profile?.skills || []).map((s: { name: string; level: number }) => [s.name.toLowerCase(), s.level]));
  const lines = report.resume ? buildDiff(report.resume, levels).final : (profile?.resume_text || "").split("\n");
  if (!lines.filter(Boolean).length) return new Response("Not ready", { status: 404 });
  const name = pdfName(profile?.resume_profile?.name || profile?.name || "");
  const pdf = await resumePdf(lines, name.replace(/\.pdf$/, ""));
  return new Response(new Uint8Array(pdf), {
    headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store" },
  });
}
