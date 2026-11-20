import { loadJob } from "@/lib/jobdata";
import { ResumePage } from "@/components/ResumePage";
import { budgetLeft } from "@/lib/usage";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, job, report, profile } = await loadJob(id);
  // An old "budget finished" on this job only matters if the budget is still finished (the admin may have topped up).
  const budgetDone = (await budgetLeft(user.id).catch(() => ({ done: false }))).done;
  return (
    <ResumePage
      jobId={job.id}
      company={report?.company_data?.name || job.company || "this job"}
      resume={report?.resume || null}
      hasResume={!!profile?.resume_text}
      skills={profile?.skills || []}
      answered={(Array.isArray(profile?.facts) ? profile.facts : []).map((f: { q: string; a: string }) => ({ q: f.q, a: f.a }))}
      initial={(profile?.name || user.email || "?")[0]}
      portal={job.portal}
      budgetDone={budgetDone}
    />
  );
}
