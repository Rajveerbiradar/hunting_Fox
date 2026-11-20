import { notFound, redirect } from "next/navigation";
import { adminClient, currentUser, userClient } from "@/lib/supabase/clients";
import { isAdminEmail } from "@/lib/limits";

/**
 * Job + report + profile for the job pages. RLS keeps it to the owner.
 * An admin can open any student's job (admin Jobs → Open) to see exactly what they see: read with the service key,
 * with the STUDENT's profile (their resume and skills), and `asAdmin` set so the page shows it's a read-only view.
 * Buttons that change things still check the owner on the server, so an admin can't change a student's job.
 */
export async function loadJob(id: string) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  const sb = await userClient();
  const [{ data: job }, { data: report }, { data: profile }] = await Promise.all([
    sb.from("jobs").select("*").eq("id", id).maybeSingle(),
    sb.from("reports").select("*").eq("job_id", id).maybeSingle(),
    sb.from("profiles").select("*").eq("id", user.id).single(),
  ]);
  if (job) return { user, job, report, profile, asAdmin: false };
  if (!(await isAdminEmail(user.email))) notFound();
  const ad = adminClient();
  const { data: j } = await ad.from("jobs").select("*").eq("id", id).maybeSingle();
  if (!j) notFound();
  const [{ data: r }, { data: owner }] = await Promise.all([
    ad.from("reports").select("*").eq("job_id", id).maybeSingle(),
    ad.from("profiles").select("*").eq("id", j.user_id).single(),
  ]);
  return { user, job: j, report: r, profile: owner, asAdmin: true };
}
