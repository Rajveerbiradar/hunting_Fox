import { NextResponse } from "next/server";
import { adminClient, currentUser, userClient } from "@/lib/supabase/clients";

const APPLY = ["applied", "no_reply", "replied", "interview", "got_job", "not_selected", "not_applying", null];

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  const sb = await userClient();
  const [{ data: job }, { data: report }] = await Promise.all([
    sb.from("jobs").select("*").eq("id", id).maybeSingle(),
    sb.from("reports").select("*").eq("job_id", id).maybeSingle(),
  ]);
  if (!job) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ job, report });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if ("apply_status" in body && APPLY.includes(body.apply_status)) {
    patch.apply_status = body.apply_status;
    if (body.apply_status === "applied") patch.applied_at = new Date().toISOString();
  }
  if (body.opened_posting) patch.opened_posting_at = new Date().toISOString();
  if (Array.isArray(body.sent_to)) patch.sent_to = body.sent_to.slice(0, 20);
  const sb = await userClient();
  const { error } = await sb.from("jobs").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (patch.apply_status === "applied")
    await adminClient().from("events").insert({ user_id: user.id, job_id: id, name: "applied_marked" });
  return NextResponse.json({ ok: true });
}
