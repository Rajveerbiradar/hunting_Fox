import Link from "next/link";
import { redirect } from "next/navigation";
import { adminOverview, requireAdmin } from "@/lib/admin";
import { AdminPanel } from "@/components/AdminPanel";
import { appSettings } from "@/lib/secrets";
import { currentUser } from "@/lib/supabase/clients";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await currentUser();
  // Not signed in: sign in, then come straight back here.
  if (!user) redirect("/sign-in?next=/admin");
  const me = await requireAdmin();
  if (!me) {
    // Signed in, but not an admin: say which account, so it's obvious what to fix.
    return (
      <main className="wrap" style={{ maxWidth: 520, paddingTop: 96 }}>
        <div className="card" style={{ padding: 32 }}>
          <h1 className="h2">This account isn&apos;t an admin</h1>
          <p className="mute" style={{ fontSize: 16, lineHeight: 1.5, margin: "12px 0 0" }}>You&apos;re signed in as <b style={{ color: "var(--ink)" }}>{user.email}</b>. Only emails in ADMIN_EMAILS (or added in Settings) can open the admin.</p>
          <div style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
            <Link href="/" className="btn sec">Go home</Link>
            <Link href="/account" className="btn ghost">Sign out in Account</Link>
          </div>
        </div>
      </main>
    );
  }
  const [data, st] = await Promise.all([adminOverview(), appSettings()]);
  return <AdminPanel initial={data} me={me.email || ""} defaultSearches={st.defaultSearches} />;
}
