import { loadJob } from "@/lib/jobdata";
import { buildDiff } from "@/lib/resumeDiff";
import { ResumeSheet } from "@/components/ResumeSheet";

export const dynamic = "force-dynamic";

/** Clean one-column resume; the browser's "Save as PDF" makes the file. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { report, profile } = await loadJob(id);
  const levels = Object.fromEntries((profile?.skills || []).map((s: { name: string; level: number }) => [s.name.toLowerCase(), s.level]));
  const lines = report?.resume ? buildDiff(report.resume, levels).final : (profile?.resume_text || "").split("\n");
  return <ResumeSheet lines={lines} />;
}

