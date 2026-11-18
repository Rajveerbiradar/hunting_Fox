import { adminClient, currentUser } from "@/lib/supabase/clients";
import { isAdminEmail } from "@/lib/limits";

export async function requireAdmin() {
  const user = await currentUser();
  return user && isAdminEmail(user.email) ? user : null;
}

/** Every student with their approval, allowance and usage, plus the Beep numbers. */
export async function adminOverview() {
  const sb = adminClient();
  const [{ data: profiles }, { data: jobs }, { data: events }] = await Promise.all([
    sb.from("profiles").select("id,name,email,approved,search_limit,approved_at,note,created_at,resume_added_at,declined_at").order("created_at", { ascending: false }),
    sb.from("jobs").select("user_id,status,own_key"),
    sb.from("events").select("name,user_id"),
  ]);
  const used = new Map<string, number>();
  (jobs || []).forEach((j) => { if (!j.own_key && !["failed", "closed", "fake"].includes(j.status)) used.set(j.user_id, (used.get(j.user_id) || 0) + 1); });
  const count = (n: string) => (events || []).filter((e) => e.name === n).length;
  const students = new Set((events || []).filter((e) => e.name === "started").map((e) => e.user_id)).size;
  return {
    users: (profiles || []).map((p) => ({ ...p, used: used.get(p.id) || 0 })),
    stats: { students, started: count("started"), finished: count("finished"), failed: count("failed"), applied: count("applied_marked") },
  };
}
