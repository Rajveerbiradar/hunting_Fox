import { notFound } from "next/navigation";
import { adminOverview, requireAdmin } from "@/lib/admin";
import { AdminPanel } from "@/components/AdminPanel";

export const dynamic = "force-dynamic";

export default async function Page() {
  const me = await requireAdmin();
  if (!me) notFound();
  const data = await adminOverview();
  return <AdminPanel initial={data} me={me.email || ""} />;
}
