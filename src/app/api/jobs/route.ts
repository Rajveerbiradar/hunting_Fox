import { NextResponse, after } from "next/server";
import { adminClient, currentUser, userClient } from "@/lib/supabase/clients";
import { checkLink } from "@/lib/links";
import { runJob } from "@/lib/pipeline/run";
import { access } from "@/lib/limits";
import { appSettings } from "@/lib/secrets";

export const maxDuration = 300;
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  const sb = await userClient();
  const { data } = await sb.from("jobs").select("*").order("created_at", { ascending: false });
  return NextResponse.json({ jobs: data || [], ...(await access(user.id, user.email)) });
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  const { link } = await req.json().catch(() => ({ link: "" }));
  const c = checkLink(String(link || ""));
  if (c.kind !== "ok") return NextResponse.json({ error: "bad_link", msg: c.msg }, { status: 400 });

  if (!(await access(user.id, user.email)).approved) return NextResponse.json({ error: "pending" }, { status: 403 });
  if ((await appSettings()).paused) return NextResponse.json({ error: "paused", msg: "New searches are paused for a little while. Your saved jobs still work. Try again later." }, { status: 503 });
  const sb = adminClient();
  const { data: existing } = await sb.from("jobs").select("id,status").eq("user_id", user.id).eq("url", c.url).maybeSingle();
  if (existing) {
    // A failed scan can be retried; anything else just opens what we already have.
    if (existing.status === "failed") {
      await sb.from("jobs").update({ status: "queued", step: 0, error: null }).eq("id", existing.id);
      after(() => runJob(existing.id));
      return NextResponse.json({ id: existing.id, retried: true });
    }
    return NextResponse.json({ id: existing.id, duplicate: true });
  }
  const a = await access(user.id, user.email);
  if (!a.approved) return NextResponse.json({ error: "pending" }, { status: 403 });
  if (a.left <= 0 && !a.ownApify) return NextResponse.json({ error: "limit" }, { status: 402 });

  const { data: job, error } = await sb
    .from("jobs")
    .insert({ user_id: user.id, url: c.url, portal: c.portal })
    .select("id")
    .single();
  if (error || !job) return NextResponse.json({ error: "db", msg: error?.message }, { status: 500 });
  await sb.from("events").insert({ user_id: user.id, job_id: job.id, name: "started" });

  // Each job runs in its own background invocation: one failing never blocks another.
  after(() => runJob(job.id));
  return NextResponse.json({ id: job.id }, { status: 201 });
}
