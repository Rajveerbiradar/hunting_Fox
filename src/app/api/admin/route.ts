import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/clients";
import { adminOverview, requireAdmin } from "@/lib/admin";
import { sendEmail } from "@/lib/email";
import { signupNotYet, withContact } from "@/lib/messages";

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
  // AI budget in tokens: set it, or top it up (adds to what's left).
  if (b.ai_limit != null) patch.ai_token_limit = Math.max(0, Math.round(Number(b.ai_limit) || 0));
  if (b.ai_add != null) {
    // A top-up gives that many tokens to USE from now. Usage can run past the limit (a call already running when the
    // limit is hit still counts), so adding to the old limit could leave a student still "used up" after +100k.
    const { data: cur } = await sb.from("profiles").select("ai_token_limit,ai_tokens_used").eq("id", b.id).single();
    const base = Math.max(cur?.ai_token_limit || 0, cur?.ai_tokens_used || 0);
    patch.ai_token_limit = Math.max(0, base + Math.round(Number(b.ai_add) || 0));
  }
  // "Can't let you in yet": they stay on the waiting list and get the message in the app and by email.
  if (b.decline) {
    patch.declined_at = new Date().toISOString();
    patch.decline_message = withContact(String(b.message || "").trim() || signupNotYet(before?.name));
  }
  const { error } = await sb.from("profiles").update(patch).eq("id", b.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (b.decline && before?.email) await sendEmail(before.email, "About Hunting Fox", String(patch.decline_message));
  if (b.approved === true && !before?.approved && before?.email) {
    const site = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
    await sendEmail(before.email, "You're in: Hunting Fox", withContact(`Hi ${before.name?.split(" ")[0] || "there"},\n\nYou're in. You have ${patch.search_limit ?? "your"} job searches.\nPaste a job link here: ${site}\n\nIf you get a reply or an interview, I'd love to hear about it.\n\nRajveer`));
  }
  return NextResponse.json({ ok: true });
}
