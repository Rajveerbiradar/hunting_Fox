import { notFound } from "next/navigation";
import { adminOverview, requireAdmin } from "@/lib/admin";
import { AdminPanel } from "@/components/AdminPanel";
import { appSettings } from "@/lib/secrets";

export const dynamic = "force-dynamic";

export default async function Page() {
  const me = await requireAdmin();
  if (!me) notFound();
  const [data, st] = await Promise.all([adminOverview(), appSettings()]);
  return <AdminPanel initial={data} me={me.email || ""} defaultSearches={st.defaultSearches} />;
}
