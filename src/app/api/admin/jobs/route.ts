import { NextResponse, after } from "next/server";
import { adminClient } from "@/lib/supabase/clients";
import { requireAdmin } from "@/lib/admin";
import { runJob } from "@/lib/pipeline/run";

export const maxDuration = 300;

/** Every job link students pasted, with who pasted it, what came of it and how long it took. */
export async function GET(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sb = adminClient();
  // ?log=<job id>: that job's step-by-step log.
  const logFor = new URL(req.url).searchParams.get("log");
  if (logFor) {
    const { data, error } = await sb.from("job_logs").select("at,level,step,msg,ms").eq("job_id", logFor).order("id").limit(300);
    return NextResponse.json({ log: data || [], error: error ? "Run supabase/migrations/006_job_logs.sql to turn on logs." : undefined });
  }
  const { data: jobs } = await sb.from("jobs").select("id,user_id,url,portal,status,step,error,title,company,created_at,finished_at,own_key,reports(people,verdict)").order("created_at", { ascending: false }).limit(500);
  const ids = [...new Set((jobs || []).map((j) => j.user_id))];
  const { data: profs } = await sb.from("profiles").select("id,name,email").in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  const rows = (jobs || []).map((j) => {
    const r = Array.isArray(j.reports) ? j.reports[0] : j.reports;
    const p = (profs || []).find((x) => x.id === j.user_id);
    return {
      id: j.id, url: j.url, portal: j.portal, status: j.status, step: j.step, error: j.error, title: j.title, company: j.company,
      created_at: j.created_at, finished_at: j.finished_at, own_key: j.own_key,
      people: Array.isArray(r?.people) ? r.people.length : null, verdict: r?.verdict || null,
      student: p?.name || p?.email || "Student",
    };
  });
  return NextResponse.json({ jobs: rows });
}

/** Run a job again. Doesn't use one of the student's searches. */
export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await req.json().catch(() => ({ id: "" }));
  if (!id) return NextResponse.json({ error: "no_id" }, { status: 400 });
  await adminClient().from("jobs").update({ status: "queued", step: 0, step_detail: null, error: null, attempts: 0, finished_at: null }).eq("id", id);
  after(() => runJob(id));
  return NextResponse.json({ ok: true });
}
