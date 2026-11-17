import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/clients";
import { adminOverview, requireAdmin } from "@/lib/admin";
import { sendEmail } from "@/lib/email";

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json(await adminOverview());
}

/** Approve / revoke a student, or set how many searches they get. */
export async function PATCH(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  if (!b.id) return NextResponse.json({ error: "no_id" }, { status: 400 });
  const sb = adminClient();
  const { data: before } = await sb.from("profiles").select("approved,email,name").eq("id", b.id).single();
  const patch: Record<string, unknown> = {};
  if (typeof b.approved === "boolean") {
    patch.approved = b.approved;
    patch.approved_at = b.approved ? new Date().toISOString() : null;
  }
  if (b.search_limit != null) patch.search_limit = Math.max(0, Math.min(500, Number(b.search_limit) || 0));
  if (typeof b.note === "string") patch.note = b.note.slice(0, 200);
  const { error } = await sb.from("profiles").update(patch).eq("id", b.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (b.approved === true && !before?.approved && before?.email) {
    const site = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
    await sendEmail(before.email, "You're in: Hunting Fox", `Hi ${before.name?.split(" ")[0] || "there"},\n\nYou're approved. You have ${patch.search_limit ?? "your"} job searches.\nPaste a job link here: ${site}\n\nRajveer`);
  }
  return NextResponse.json({ ok: true });
}
