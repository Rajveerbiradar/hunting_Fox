import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/clients";
import { runJob } from "@/lib/pipeline/run";
import { appSettings } from "@/lib/secrets";
import { pooledRemainingUsd } from "@/lib/apify";

export const maxDuration = 300;

/** Daily: retry stuck scans once, flip "Applied" jobs with no news after 6 days to "No reply yet", apply the 30-day delete if it's on, and refresh Apify credit. */
export async function GET(req: Request) {
  if (process.env.CRON_SECRET && req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = adminClient();
  const stuckBefore = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data: stuck } = await sb
    .from("jobs")
    .select("id")
    .in("status", ["queued", "scanning"])
    .lt("created_at", stuckBefore)
    .lt("attempts", 2)
    .limit(10);
  await Promise.all((stuck || []).map((j) => runJob(j.id)));

  const sixDays = new Date(Date.now() - 6 * 86400_000).toISOString();
  await sb.from("jobs").update({ apply_status: "no_reply" }).eq("apply_status", "applied").lt("applied_at", sixDays);
  // "Delete student data after 30 days" in /admin → Settings.
  let deleted = 0;
  if ((await appSettings()).retention30) {
    const month = new Date(Date.now() - 30 * 86400_000).toISOString();
    const { data: old } = await sb.from("jobs").select("id").lt("created_at", month).limit(1000);
    if (old?.length) { await sb.from("jobs").delete().in("id", old.map((j) => j.id)); deleted = old.length; }
    await sb.from("company_cache").delete().lt("fetched_at", month);
  }
  // Refresh every Apify account's credit.
  await pooledRemainingUsd().catch(() => 0);
  return NextResponse.json({ retried: stuck?.length || 0, deleted });
}
