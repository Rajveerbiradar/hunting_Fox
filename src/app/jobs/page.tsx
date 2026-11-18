import { redirect } from "next/navigation";
import { currentUser, userClient } from "@/lib/supabase/clients";
import { access } from "@/lib/limits";
import { SearchedJobs } from "@/components/SearchedJobs";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  const sb = await userClient();
  const [{ data: jobs }, a] = await Promise.all([
    sb.from("jobs").select("id,title,company,status,step,apply_status,applied_at,created_at,reports(verdict,people)").order("created_at", { ascending: false }),
    access(user.id, user.email),
  ]);
  const rows = (jobs || []).map((j) => {
    const r = Array.isArray(j.reports) ? j.reports[0] : j.reports;
    return { ...j, reports: undefined, verdict: r?.verdict || null, people: Array.isArray(r?.people) ? r.people.length : 0 };
  });
  return <SearchedJobs jobs={rows} left={a.left} limit={a.limit} initial={(user.email || "?")[0]} />;
}
