import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/clients";
import { runJob } from "@/lib/pipeline/run";

export const maxDuration = 300;

/** Daily: retry stuck scans once, and flip "Applied" jobs with no news after 6 days to "No reply yet". */
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
  return NextResponse.json({ retried: stuck?.length || 0 });
}
