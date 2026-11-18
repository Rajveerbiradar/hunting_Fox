import { adminClient } from "@/lib/supabase/clients";
import { hasOwnApify } from "@/lib/ownKeys";
import { appSettings } from "@/lib/secrets";

/** Admins: ADMIN_EMAILS (comma separated) plus anyone added in /admin → Settings. They're always approved. */
export function envAdmins() {
  return (process.env.ADMIN_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}
export async function isAdminEmail(email?: string | null) {
  if (!email) return false;
  const e = email.toLowerCase();
  if (envAdmins().includes(e)) return true;
  return (await appSettings()).extraAdmins.includes(e);
}

/** Searches that count toward the allowance: failed, closed and fake jobs don't, nor ones run on the student's own Apify key. */
export async function searchesUsed(userId: string) {
  const { count } = await adminClient()
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("own_key", false)
    .not("status", "in", "(failed,closed,fake)");
  return count || 0;
}

export type Access = { approved: boolean; admin: boolean; limit: number; used: number; left: number; ownApify: boolean };

/** Is this student approved, and how many searches do they have left? */
export async function access(userId: string, email?: string | null): Promise<Access> {
  const admin = await isAdminEmail(email);
  const [first, used, ownApify] = await Promise.all([
    adminClient().from("profiles").select("approved,search_limit,declined_at").eq("id", userId).maybeSingle(),
    searchesUsed(userId),
    hasOwnApify(userId).catch(() => false),
  ]);
  let data = first.data;
  // "Approve everyone automatically" in Settings: let them in on their first visit.
  if (!admin && data && !data.approved) {
    const st = await appSettings();
    if (st.autoApprove && !(data as { declined_at?: string | null }).declined_at) {
      await adminClient().from("profiles").update({ approved: true, approved_at: new Date().toISOString(), search_limit: data.search_limit || st.defaultSearches }).eq("id", userId);
      data = { ...data, approved: true, search_limit: data.search_limit || st.defaultSearches };
    }
  }
  const approved = admin || !!data?.approved;
  const limit = admin ? Math.max(data?.search_limit || 0, 1000) : data?.search_limit || 0;
  return { approved, admin, limit, used, left: Math.max(0, limit - used), ownApify };
}
