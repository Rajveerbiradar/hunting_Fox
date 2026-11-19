import { loadJob } from "@/lib/jobdata";
import { ReachOut } from "@/components/ReachOut";
import { isPersonalised } from "@/lib/resumeDiff";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, job, report, profile } = await loadJob(id);
  // Which resume the PDF will be: this company's version (applied changes) or the student's main resume.
  const base = String(profile?.resume_text || "").split("\n").map((l: string) => l.trim()).filter(Boolean);
  const levels = Object.fromEntries((profile?.skills || []).map((s: { name: string; level: number }) => [s.name.toLowerCase(), s.level]));
  const personalised = isPersonalised(report?.resume, levels);
  return (
    <ReachOut
      jobId={job.id}
      company={report?.company_data?.name || job.company || "this company"}
      big={report?.size_band === "big"}
      people={report?.people || []}
      hiringEmail={report?.job_data?.hiringEmail}
      sentTo={job.sent_to || []}
      initial={(profile?.name || user.email || "?")[0]}
      hasResume={base.length > 0}
      personalised={personalised}
      mine={(profile?.skills || []).filter((s: { level: number }) => s.level >= 2).map((s: { name: string }) => s.name)}
      resumeText={base.join("\n")}
      job={report?.job_data || null}
      asked={(report?.resume?.skill_questions || []).map((q: { skill: string }) => q.skill)}
    />
  );
}
