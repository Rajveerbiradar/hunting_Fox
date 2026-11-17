import { notFound, redirect } from "next/navigation";
import { currentUser, userClient } from "@/lib/supabase/clients";

/** Job + report + profile for the job pages. RLS keeps it to the owner. */
export async function loadJob(id: string) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  const sb = await userClient();
  const [{ data: job }, { data: report }, { data: profile }] = await Promise.all([
    sb.from("jobs").select("*").eq("id", id).maybeSingle(),
    sb.from("reports").select("*").eq("job_id", id).maybeSingle(),
    sb.from("profiles").select("*").eq("id", user.id).single(),
  ]);
  if (!job) notFound();
  return { user, job, report, profile };
}
