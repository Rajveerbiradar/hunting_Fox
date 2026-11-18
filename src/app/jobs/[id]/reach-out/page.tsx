import { loadJob } from "@/lib/jobdata";
import { ReachOut } from "@/components/ReachOut";
import type { Person } from "@/lib/pipeline/types";

/** Messages made by the old fill-in-the-blanks template (now removed). They're shown as not written, so the student gets a real one. */
const isOldTemplate = (x: Person) => /I'm writing to you because you work at|Most recently: .*\.\n\nI (applied|'m applying) for the/.test(x.body || "");

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, job, report, profile } = await loadJob(id);
  return (
    <ReachOut
      jobId={job.id}
      company={report?.company_data?.name || job.company || "this company"}
      big={report?.size_band === "big"}
      people={(report?.people || []).map((x: Person) => (isOldTemplate(x) ? { ...x, written: false, note: undefined, subject: undefined, body: undefined } : x))}
      hiringEmail={report?.job_data?.hiringEmail}
      sentTo={job.sent_to || []}
      finishedAt={job.finished_at}
      initial={(profile?.name || user.email || "?")[0]}
      missingName={!profile?.name}
    />
  );
}
