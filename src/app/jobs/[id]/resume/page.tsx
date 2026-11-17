import { loadJob } from "@/lib/jobdata";
import { ResumePage } from "@/components/ResumePage";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, job, report, profile } = await loadJob(id);
  return (
    <ResumePage
      jobId={job.id}
      company={report?.company_data?.name || job.company || "this job"}
      resume={report?.resume || null}
      hasResume={!!profile?.resume_text}
      skills={profile?.skills || []}
      initial={(profile?.name || user.email || "?")[0]}
      portal={job.portal}
    />
  );
}
