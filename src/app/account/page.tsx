import { redirect } from "next/navigation";
import { currentUser, userClient } from "@/lib/supabase/clients";
import { access } from "@/lib/limits";
import { Account } from "@/components/Account";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  const sb = await userClient();
  const [{ data: profile }, a] = await Promise.all([sb.from("profiles").select("*").eq("id", user.id).single(), access(user.id, user.email)]);
  return <Account profile={profile} email={user.email || ""} left={a.left} limit={a.limit} approved={a.approved} />;
}
