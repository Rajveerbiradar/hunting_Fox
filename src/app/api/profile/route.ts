import { NextResponse } from "next/server";
import { currentUser, userClient } from "@/lib/supabase/clients";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  const sb = await userClient();
  const { data } = await sb.from("profiles").select("*").eq("id", user.id).single();
  return NextResponse.json({ profile: data });
}

/** Account page edits: skills, links, education, email settings. */
export async function PATCH(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (Array.isArray(b.skills))
    patch.skills = b.skills.slice(0, 80).map((s: { name: string; level: number; from_job?: string }) => ({
      name: String(s.name).slice(0, 60),
      level: Math.min(5, Math.max(0, Number(s.level) || 0)),
      from_job: s.from_job ? String(s.from_job).slice(0, 80) : undefined,
    }));
  if (Array.isArray(b.links)) patch.links = b.links.slice(0, 10).map((l: { label: string; url: string }) => ({ label: String(l.label).slice(0, 30), url: String(l.url).slice(0, 200) }));
  if (Array.isArray(b.education))
    patch.education = b.education.slice(0, 20).map((e: Record<string, string>) => ({ school: String(e.school || "").slice(0, 120), what: String(e.what || "").slice(0, 120), from: e.from || null, to: e.to || null }));
  if (typeof b.email_ready === "boolean") patch.email_ready = b.email_ready;
  if (typeof b.email_reminders === "boolean") patch.email_reminders = b.email_reminders;
  const sb = await userClient();
  const { error } = await sb.from("profiles").update(patch).eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
