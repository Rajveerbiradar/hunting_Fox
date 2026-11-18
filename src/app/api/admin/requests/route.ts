import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/clients";
import { requireAdmin } from "@/lib/admin";
import { sendEmail } from "@/lib/email";
import { searchesUsed } from "@/lib/limits";
import { approvedMessage, noCreditOut, noUsedALot, withContact } from "@/lib/messages";

/** Every request with who asked, how much they've used and what came of it. */
export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sb = adminClient();
  const { data: reqs } = await sb.from("search_requests").select("*").order("created_at", { ascending: false }).limit(200);
  const ids = [...new Set((reqs || []).map((r) => r.user_id))];
  const [{ data: profs }, { data: jobs }] = await Promise.all([
    sb.from("profiles").select("id,name,email,search_limit").in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
    sb.from("jobs").select("user_id,status,apply_status,own_key").in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
  ]);
  const rows = (reqs || []).map((r) => {
    const p = (profs || []).find((x) => x.id === r.user_id);
    const js = (jobs || []).filter((j) => j.user_id === r.user_id);
    const used = js.filter((j) => !j.own_key && !["failed", "closed", "fake"].includes(j.status)).length;
    return {
      ...r, name: p?.name || p?.email || "Student", email: p?.email, limit: p?.search_limit || 0, used,
      applied: js.filter((j) => j.apply_status && j.apply_status !== "not_applying").length,
      replies: js.filter((j) => ["replied", "interview", "got_job"].includes(j.apply_status || "")).length,
      templates: { used: noUsedALot(p?.name, used), credit: noCreditOut(p?.name) },
    };
  });
  return NextResponse.json({ requests: rows });
}

/** Give more searches, or say no with a message (and keep them on the waiting list). */
export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const sb = adminClient();
  const { data: r } = await sb.from("search_requests").select("*").eq("id", b.id).maybeSingle();
  if (!r) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { data: p } = await sb.from("profiles").select("name,email,search_limit").eq("id", r.user_id).single();
  const now = new Date().toISOString();

  if (b.action === "give") {
    const n = Math.max(1, Math.min(200, Number(b.n) || 10));
    const used = await searchesUsed(r.user_id);
    const limit = Math.max(p?.search_limit || 0, used) + n;
    await sb.from("profiles").update({ search_limit: limit }).eq("id", r.user_id);
    const message = approvedMessage(p?.name, n, limit - used);
    await sb.from("search_requests").update({ status: "approved", granted: n, message, answered_at: now, seen_at: null }).eq("id", r.id);
    if (p?.email) await sendEmail(p.email, `You've got ${n} more searches`, message);
  } else if (b.action === "decline") {
    const message = withContact(String(b.message || "").trim() || noCreditOut(p?.name));
    await sb.from("search_requests").update({ status: "declined", waitlist: b.waitlist !== false, message, answered_at: now, seen_at: null }).eq("id", r.id);
    if (p?.email) await sendEmail(p.email, "About your request for more searches", message);
  } else {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
