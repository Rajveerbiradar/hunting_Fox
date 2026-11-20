import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { adminClient } from "@/lib/supabase/clients";

export const dynamic = "force-dynamic";

/**
 * Read-only debug view for Claude (no browser sign-in needed). Off unless DEBUG_TOKEN (24+ characters) is set in
 * Vercel; every call must send `Authorization: Bearer <DEBUG_TOKEN>`. It only reads: jobs, their logs, verdicts
 * and checks. No keys, no resumes, no student contact details.
 *   GET /api/debug?q=<text in the job link, title or company>  → matching jobs (newest 20)
 *   GET /api/debug?job=<job id>                                  → that job, its checks, company data and log
 */
function allowed(req: Request) {
  const want = process.env.DEBUG_TOKEN || "";
  const got = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (want.length < 24 || got.length !== want.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

export async function GET(req: Request) {
  if (!allowed(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sb = adminClient();
  const u = new URL(req.url);
  const job = u.searchParams.get("job");
  if (job) {
    const [{ data: j }, { data: r }, { data: log }] = await Promise.all([
      sb.from("jobs").select("id,url,portal,status,step,step_detail,error,title,company,created_at,finished_at,own_key").eq("id", job).maybeSingle(),
      sb.from("reports").select("verdict,checks,company_data,people").eq("job_id", job).maybeSingle(),
      sb.from("job_logs").select("at,level,step,msg,ms").eq("job_id", job).order("id").limit(400),
    ]);
    const people = Array.isArray(r?.people) ? r!.people.map((p: { name?: string; title?: string }) => `${p.name || "?"} · ${p.title || ""}`) : [];
    return NextResponse.json({ job: j, verdict: r?.verdict, checks: r?.checks, company: r?.company_data, people, log });
  }
  const q = (u.searchParams.get("q") || "").trim();
  let query = sb.from("jobs").select("id,url,status,error,title,company,created_at").order("created_at", { ascending: false }).limit(20);
  if (q) query = query.or(`url.ilike.%${q.replace(/[%,()]/g, "")}%,title.ilike.%${q.replace(/[%,()]/g, "")}%,company.ilike.%${q.replace(/[%,()]/g, "")}%`);
  const { data } = await query;
  return NextResponse.json({ jobs: data || [] });
}
