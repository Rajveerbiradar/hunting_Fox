import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/clients";
import { requireAdmin } from "@/lib/admin";
import { pooledCredit } from "@/lib/apify";

/** The numbers for the Beep write-up. range: today | 48h | all */
export async function GET(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const range = new URL(req.url).searchParams.get("range") || "all";
  const since = range === "today" ? new Date(new Date().setHours(0, 0, 0, 0)) : range === "48h" ? new Date(Date.now() - 48 * 3600_000) : new Date(0);
  const iso = since.toISOString();
  const sb = adminClient();
  const [{ data: profs }, { data: jobs }, { data: events }, pool] = await Promise.all([
    sb.from("profiles").select("id,approved,created_at").gte("created_at", iso),
    sb.from("jobs").select("user_id,status,apply_status,created_at,finished_at,own_key").gte("created_at", iso),
    sb.from("events").select("name,user_id,created_at").gte("created_at", iso),
    pooledCredit().catch(() => ({ left: 0, start: 0, accounts: 0, working: 0 })),
  ]);
  const P = profs || [], J = jobs || [], E = events || [];
  const count = (n: string) => E.filter((e) => e.name === n).length;
  const searched = new Set(J.map((j) => j.user_id));
  const finishedUsers = new Set(J.filter((j) => j.status === "ready").map((j) => j.user_id));
  const appliedUsers = new Set(J.filter((j) => j.apply_status && j.apply_status !== "not_applying").map((j) => j.user_id));
  const heardUsers = new Set(J.filter((j) => ["replied", "interview", "got_job", "not_selected"].includes(j.apply_status || "")).map((j) => j.user_id));
  const has = (k: string[]) => J.filter((j) => k.includes(j.apply_status || "")).length;
  const finished = J.filter((j) => j.status === "ready");
  const secs = finished.map((j) => (new Date(j.finished_at!).getTime() - new Date(j.created_at).getTime()) / 1000).filter((n) => n > 0).sort((a, b) => a - b);

  const stats = [
    ["Signed up", P.length], ["Approved", P.filter((p) => p.approved).length], ["Students who searched", searched.size],
    ["Searches started", count("started") || J.length], ["Finished", count("finished") || finished.length], ["Failed", count("failed") || J.filter((j) => j.status === "failed").length],
    ["Marked applied", J.filter((j) => j.apply_status && !["not_applying"].includes(j.apply_status)).length],
    ["They replied", has(["replied", "interview", "got_job"])], ["Interviews", has(["interview", "got_job"])], ["Got the job", has(["got_job"])],
  ];
  const funnel = [
    ["Signed up", P.length], ["Approved", P.filter((p) => p.approved).length], ["Pasted a job", searched.size],
    ["Got a finished job", finishedUsers.size], ["Marked applied", appliedUsers.size], ["Heard back", heardUsers.size],
  ];
  // Searches per day, last 14 days (always, so the chart has a shape).
  const days: [string, number][] = [];
  const { data: last14 } = await sb.from("jobs").select("created_at").gte("created_at", new Date(Date.now() - 14 * 86400_000).toISOString());
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400_000);
    const key = d.toISOString().slice(0, 10);
    days.push([d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }), (last14 || []).filter((j) => j.created_at.slice(0, 10) === key).length]);
  }
  const apifyUsed = Math.max(0, pool.start - pool.left);
  return NextResponse.json({
    stats, funnel, days,
    cost: { apify: apifyUsed, perJob: finished.length ? apifyUsed / Math.max(1, finished.length) : 0, ownKeyJobs: J.filter((j) => j.own_key).length },
    timing: { median: secs.length ? Math.round(secs[Math.floor(secs.length / 2)]) : null },
  });
}
