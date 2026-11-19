import { redirect } from "next/navigation";
import { currentUser, userClient } from "@/lib/supabase/clients";
import { ResumeSetup } from "@/components/ResumeSetup";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  const { data: profile } = await (await userClient()).from("profiles").select("name").eq("id", user.id).single();
  return <ResumeSetup initial={(profile?.name || user.email || "?")[0]} />;
}
