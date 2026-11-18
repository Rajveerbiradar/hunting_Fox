import { currentUser, userClient } from "@/lib/supabase/clients";
import { buildDiff } from "@/lib/resumeDiff";
import { pdfName, resumePdf } from "@/lib/resumePdf";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** The job's resume as a real PDF file, made on our server. No browser print dialog. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) return new Response("Sign in first", { status: 401 });
  const sb = await userClient();
  const [{ data: job }, { data: report }, { data: profile }] = await Promise.all([
    sb.from("jobs").select("company").eq("id", id).maybeSingle(),
    sb.from("reports").select("resume").eq("job_id", id).maybeSingle(),
    sb.from("profiles").select("name,skills,resume_text,resume_profile").eq("id", user.id).single(),
  ]);
  if (!job) return new Response("Not found", { status: 404 });
  const levels = Object.fromEntries((profile?.skills || []).map((s: { name: string; level: number }) => [s.name.toLowerCase(), s.level]));
  const lines = report?.resume ? buildDiff(report.resume, levels).final : (profile?.resume_text || "").split("\n");
  if (!lines.filter(Boolean).length) return new Response("Add your resume first", { status: 400 });
  const name = pdfName(profile?.resume_profile?.name || profile?.name || "", job.company);
  const pdf = await resumePdf(lines, name.replace(/\.pdf$/, ""));
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "cache-control": "private, no-store",
    },
  });
}
