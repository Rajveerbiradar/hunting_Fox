import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/clients";
import { requireAdmin } from "@/lib/admin";
import { appSettings, saveSetting } from "@/lib/secrets";
import { envAdmins } from "@/lib/limits";
import { CONTACT } from "@/lib/contact";

const SWITCHES: Record<string, string> = { autoApprove: "auto_approve", allowAskMore: "allow_ask_more", emailsOn: "emails_on", retention30: "retention_30", paused: "paused" };

async function overview(me: string) {
  const s = await appSettings();
  const admins = [...new Set([...envAdmins(), ...s.extraAdmins])].map((email) => ({ email, fromEnv: envAdmins().includes(email), you: email === me.toLowerCase() }));
  return { ...s, admins, contact: CONTACT, emailReady: !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM) };
}

export async function GET() {
  const me = await requireAdmin();
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json(await overview(me.email || ""));
}

export async function POST(req: Request) {
  const me = await requireAdmin();
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const s = await appSettings();

  if (b.type === "switch" && SWITCHES[b.name]) {
    await saveSetting(SWITCHES[b.name], b.value ? "1" : "0");
  } else if (b.type === "default_searches") {
    await saveSetting("default_searches", String(Math.max(1, Math.min(500, Number(b.value) || 25))));
  } else if (b.type === "add_admin") {
    const e = String(b.email || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return NextResponse.json({ error: "That doesn't look like an email address." }, { status: 400 });
    await saveSetting("extra_admins", [...new Set([...s.extraAdmins, e])].join(","));
  } else if (b.type === "remove_admin") {
    const e = String(b.email || "").toLowerCase();
    if (e === (me.email || "").toLowerCase()) return NextResponse.json({ error: "You can't remove yourself." }, { status: 400 });
    await saveSetting("extra_admins", s.extraAdmins.filter((x) => x !== e).join(","));
  } else if (b.type === "wipe") {
    // Delete every student (not admins) and everything they made. Cascades to profiles, jobs, reports, keys and requests.
    if (b.confirm !== "DELETE") return NextResponse.json({ error: "Type DELETE to confirm." }, { status: 400 });
    const sb = adminClient();
    const keep = new Set([...envAdmins(), ...s.extraAdmins]);
    const { data: profs } = await sb.from("profiles").select("id,email");
    const gone = (profs || []).filter((p) => !keep.has((p.email || "").toLowerCase()));
    for (const p of gone) {
      const { data: files } = await sb.storage.from("resumes").list(p.id);
      if (files?.length) await sb.storage.from("resumes").remove(files.map((f) => `${p.id}/${f.name}`));
      await sb.auth.admin.deleteUser(p.id);
    }
    await Promise.all([
      sb.from("company_cache").delete().neq("key", ""),
      sb.from("events").delete().gte("id", 0),
    ]);
    return NextResponse.json({ ...(await overview(me.email || "")), deleted: gone.length });
  } else {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
  return NextResponse.json(await overview(me.email || ""));
}
