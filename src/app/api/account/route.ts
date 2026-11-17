import { NextResponse } from "next/server";
import { adminClient, currentUser } from "@/lib/supabase/clients";

/** "Delete my account and data": removes the user; jobs, reports and profile cascade. */
export async function DELETE() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  const sb = adminClient();
  const { data: files } = await sb.storage.from("resumes").list(user.id);
  if (files?.length) await sb.storage.from("resumes").remove(files.map((f) => `${user.id}/${f.name}`));
  await sb.auth.admin.deleteUser(user.id);
  return NextResponse.json({ ok: true });
}
