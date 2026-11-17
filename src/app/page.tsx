import { currentUser, userClient } from "@/lib/supabase/clients";
import { access } from "@/lib/limits";
import { Home } from "@/components/Home";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ link?: string }> }) {
  const { link } = await searchParams;
  const user = await currentUser();
  if (!user) return <Home signedIn={false} initialLink={link} />;
  const sb = await userClient();
  const [{ data: profile }, { data: jobs }, a] = await Promise.all([
    sb.from("profiles").select("name,email,resume_profile,resume_added_at").eq("id", user.id).single(),
    sb.from("jobs").select("id,title,company,status,apply_status,applied_at,created_at").order("created_at", { ascending: false }).limit(30),
    access(user.id, user.email),
  ]);
  return (
    <Home
      signedIn
      initialLink={link}
      name={profile?.name || user.email || ""}
      email={user.email || ""}
      resumeName={profile?.resume_profile?.file_name || (profile?.resume_added_at ? "your resume" : "")}
      jobs={jobs || []}
      left={a.left}
      limit={a.limit}
      approved={a.approved}
      admin={a.admin}
    />
  );
}
