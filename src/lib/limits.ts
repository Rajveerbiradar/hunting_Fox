import { adminClient } from "@/lib/supabase/clients";
import { hasOwnApify } from "@/lib/ownKeys";

/** Admins are listed by email in ADMIN_EMAILS (comma separated). They're always approved. */
export function isAdminEmail(email?: string | null) {
  const list = (process.env.ADMIN_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return !!email && list.includes(email.toLowerCase());
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
  const admin = isAdminEmail(email);
  const [{ data }, used, ownApify] = await Promise.all([
    adminClient().from("profiles").select("approved,search_limit").eq("id", userId).maybeSingle(),
    searchesUsed(userId),
    hasOwnApify(userId).catch(() => false),
  ]);
  const approved = admin || !!data?.approved;
  const limit = admin ? Math.max(data?.search_limit || 0, 1000) : data?.search_limit || 0;
  return { approved, admin, limit, used, left: Math.max(0, limit - used), ownApify };
}
