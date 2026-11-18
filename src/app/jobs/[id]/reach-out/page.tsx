import { loadJob } from "@/lib/jobdata";
import { ReachOut } from "@/components/ReachOut";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, job, report, profile } = await loadJob(id);
  return (
    <ReachOut
      jobId={job.id}
      company={report?.company_data?.name || job.company || "this company"}
      big={report?.size_band === "big"}
      people={report?.people || []}
      hiringEmail={report?.job_data?.hiringEmail}
      sentTo={job.sent_to || []}
      finishedAt={job.finished_at}
      initial={(profile?.name || user.email || "?")[0]}
      missingName={!profile?.name}
    />
  );
}
