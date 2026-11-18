import { NextResponse } from "next/server";
import { adminClient, currentUser } from "@/lib/supabase/clients";
import { appSettings } from "@/lib/secrets";

/** The student's latest "Ask for more searches" and Rajveer's answer. */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  const { data } = await adminClient().from("search_requests").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return NextResponse.json({ request: data || null, allowed: (await appSettings()).allowAskMore });
}

/** Ask for more searches. One open request at a time. */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  if (!(await appSettings()).allowAskMore) return NextResponse.json({ error: "off" }, { status: 403 });
  const sb = adminClient();
  const { data: open } = await sb.from("search_requests").select("id").eq("user_id", user.id).eq("status", "waiting").maybeSingle();
  if (open) return NextResponse.json({ ok: true, already: true });
  const { data: last } = await sb.from("search_requests").select("waitlist,status").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (last?.status === "declined" && last.waitlist) return NextResponse.json({ ok: true, onList: true });
  await sb.from("search_requests").insert({ user_id: user.id, note: String(b.note || "").slice(0, 300) || null });
  return NextResponse.json({ ok: true });
}

/** The student has seen the answer: stop showing the card. */
export async function PATCH() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  await adminClient().from("search_requests").update({ seen_at: new Date().toISOString() }).eq("user_id", user.id).neq("status", "waiting").is("seen_at", null);
  return NextResponse.json({ ok: true });
}
