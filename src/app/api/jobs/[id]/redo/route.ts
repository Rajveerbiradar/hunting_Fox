import { NextResponse, after } from "next/server";
import { adminClient, currentUser } from "@/lib/supabase/clients";
import { access } from "@/lib/limits";
import { runJob } from "@/lib/pipeline/run";

export const maxDuration = 300;

/** "Redo with my resume" / "Try again": rerun the same job. Doesn't use a new free search. */
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  if (!(await access(user.id, user.email)).approved) return NextResponse.json({ error: "pending" }, { status: 403 });
  const sb = adminClient();
  const { data: job } = await sb.from("jobs").select("user_id").eq("id", id).single();
  if (!job || job.user_id !== user.id) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await sb.from("jobs").update({ status: "queued", step: 0, error: null, attempts: 0 }).eq("id", id);
  after(() => runJob(id));
  return NextResponse.json({ ok: true });
}
