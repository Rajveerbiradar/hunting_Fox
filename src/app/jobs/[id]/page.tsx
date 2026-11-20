import { AdminViewBar } from "@/components/AdminViewBar";
import { loadJob } from "@/lib/jobdata";
import { JobPage } from "@/components/JobPage";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, job, report, profile, asAdmin } = await loadJob(id);
  return (
    <>
      {asAdmin && <AdminViewBar name={profile?.name || profile?.email} />}
      <JobPage job={job} report={report} hasResume={!!profile?.resume_text} initial={(profile?.name || user.email || "?")[0]} />
    </>
  );
}
