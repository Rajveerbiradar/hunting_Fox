import { NextResponse, after } from "next/server";
import { runJob } from "@/lib/pipeline/run";
import { timingSafeEqual } from "node:crypto";
import { adminClient } from "@/lib/supabase/clients";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Read-only debug view for Claude (no browser sign-in needed). Off unless DEBUG_TOKEN (24+ characters) is set in
 * Vercel; every call must send `Authorization: Bearer <DEBUG_TOKEN>`. It only reads: jobs, their logs, verdicts
 * and checks. No keys, no resumes, no student contact details.
 *   GET /api/debug?q=<text in the job link, title or company>  → matching jobs (newest 20)
 *   GET /api/debug?job=<job id>                                  → that job, its checks, company data and log
 *   POST /api/debug {rerun: <job id>}                            → run the job again (like admin "Run again": no search used)
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
  // ?stats=1: counts only, for the submission sheet (no names or emails).
  if (u.searchParams.get("stats")) {
    const [{ data: profs }, { data: jobs }, { data: reps }] = await Promise.all([
      sb.from("profiles").select("id,created_at,resume_text"),
      sb.from("jobs").select("id,user_id,status,error,portal,created_at,company,title,sent_to"),
      sb.from("reports").select("job_id,verdict,people"),
    ]);
    const P = profs || [], J = jobs || [], R = new Map((reps || []).map((r) => [r.job_id, r]));
    const by = <T,>(xs: T[], k: (x: T) => string) => xs.reduce((m, x) => { const key = k(x) || "none"; m[key] = (m[key] || 0) + 1; return m; }, {} as Record<string, number>);
    const searchers = new Set(J.map((j) => j.user_id));
    const people = J.map((j) => { const r = R.get(j.id); return Array.isArray(r?.people) ? r!.people : []; });
    const withEmail = people.map((ps) => ps.filter((p: { email?: string; emails?: unknown[] }) => p?.email || (Array.isArray(p?.emails) && p.emails.length)).length);
    return NextResponse.json({
      students_signed_in: P.length,
      students_with_resume: P.filter((p) => (p.resume_text || "").trim()).length,
      students_who_searched: searchers.size,
      searches: J.length,
      searches_by_status: by(J, (j) => j.status),
      verdicts: by(J, (j) => R.get(j.id)?.verdict || ""),
      errors: by(J.filter((j) => j.error), (j) => j.error),
      portals: by(J, (j) => j.portal),
      ready_with_people: people.filter((ps) => ps.length).length,
      people_found_total: people.reduce((a, ps) => a + ps.length, 0),
      people_with_email_total: withEmail.reduce((a, n) => a + n, 0),
      marked_contacted: J.filter((j) => Array.isArray(j.sent_to) ? j.sent_to.length : j.sent_to).length,
      signups_by_day: by(P, (p) => String(p.created_at).slice(0, 10)),
      searches_by_day: by(J, (j) => String(j.created_at).slice(0, 10)),
      searches_per_student: Object.values(by(J, (j) => j.user_id)).sort((a, b) => b - a),
      companies: [...new Set(J.map((j) => j.company).filter(Boolean))],
    });
  }
  const q = (u.searchParams.get("q") || "").trim();
  let query = sb.from("jobs").select("id,url,status,error,title,company,created_at").order("created_at", { ascending: false }).limit(20);
  if (q) query = query.or(`url.ilike.%${q.replace(/[%,()]/g, "")}%,title.ilike.%${q.replace(/[%,()]/g, "")}%,company.ilike.%${q.replace(/[%,()]/g, "")}%`);
  const { data } = await query;
  return NextResponse.json({ jobs: data || [] });
}

export async function POST(req: Request) {
  if (!allowed(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { rerun } = await req.json().catch(() => ({ rerun: "" }));
  if (!rerun) return NextResponse.json({ error: "no_id" }, { status: 400 });
  await adminClient().from("jobs").update({ status: "queued", step: 0, step_detail: null, error: null, attempts: 0, finished_at: null }).eq("id", rerun);
  after(() => runJob(String(rerun)));
  return NextResponse.json({ ok: true });
}
