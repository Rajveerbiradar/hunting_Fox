/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse, after } from "next/server";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { requireAdmin } from "@/lib/admin";
import { adminClient } from "@/lib/supabase/clients";
import { jobCtx, jlog } from "@/lib/joblog";
import { makeResume } from "@/lib/pipeline/resume";
import { buildDiff } from "@/lib/resumeDiff";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Admin-only test bench. Runs a real AI task with the keys saved in /admin, and saves nothing to the job.
 *
 * POST { action: "resume", jobId?, draft?, rules?, builder? }
 *  - draft: a name like "v4" loads prompts/drafts/resume-changes-v4.md (and build-prompt-v4.md if it exists)
 *    as the rules / builder. Drafts ship with the app but nothing else uses them.
 *  - jobId: which job to tailor for (default: the admin's newest finished job).
 *  - rules / builder: optional prompt text to try instead of prompts/resume-changes.md / prompts/build-prompt.md,
 *    so a prompt change can be tested before it's deployed.
 * Runs in the background (a browser request drops after ~90 s, and a rewrite takes 2 to 3 minutes): answers
 * { run } at once; GET ?run=<id> returns { status: "running" } until the result is saved, then the result:
 * the prompt the first step wrote, the raw AI answer, and the resume with every change applied.
 * Results are kept as JSON in the `resumes` storage bucket under test-runs/.
 * Uses the job owner's resume and facts. Tokens count against the admin's own AI budget.
 */
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "not_admin" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  if (b.action !== "resume") return NextResponse.json({ error: "unknown_action", actions: ["resume"] }, { status: 400 });
  const sb = adminClient();

  let jobId: string | undefined = b.jobId;
  if (!jobId) {
    const { data } = await sb.from("jobs").select("id").eq("user_id", admin.id).eq("status", "ready").order("created_at", { ascending: false }).limit(1);
    jobId = data?.[0]?.id;
  }
  if (!jobId) return NextResponse.json({ error: "no_job" }, { status: 404 });
  const { data: job } = await sb.from("jobs").select("id,user_id,title,company").eq("id", jobId).single();
  const { data: report } = await sb.from("reports").select("job_data,company_data").eq("job_id", jobId).single();
  if (!job || !report?.job_data) return NextResponse.json({ error: "no_job" }, { status: 404 });
  const { data: profile } = await sb.from("profiles").select("*").eq("id", job.user_id).single();
  const lines = String(profile?.resume_text || "").split("\n").filter((l) => l.trim());
  if (!lines.length) return NextResponse.json({ error: "no_resume" }, { status: 400 });

  // A committed draft prompt (prompts/drafts/*-<draft>.md), so a test doesn't need the whole text in the request.
  const draft = typeof b.draft === "string" && /^[a-z0-9-]{1,30}$/.test(b.draft) ? b.draft : "";
  const readDraft = (name: string) => {
    const f = path.join(process.cwd(), "prompts", "drafts", `${name}-${draft}.md`);
    return draft && existsSync(f) ? readFileSync(f, "utf8") : undefined;
  };
  const draftRules = readDraft("resume-changes");
  const draftBuilder = readDraft("build-prompt");
  if (draft && !draftRules) return NextResponse.json({ error: "no_draft", draft }, { status: 404 });
  const run = randomUUID();
  const file = `test-runs/${run}.json`;
  const save = (o: unknown) => sb.storage.from("resumes").upload(file, JSON.stringify(o), { contentType: "application/json", upsert: true });
  await save({ status: "running", started: new Date().toISOString() });
  let built = "";
  let raw: unknown = null;
  after(async () => {
    const t0 = Date.now();
    // No userId: test runs are the admin's own spend, not a student budget (they still show in AI usage and cost).
    const res = await jobCtx.run({ jobId, started: t0 }, async () => {
      await jlog("info", "test", `Admin test run: resume${draft ? ` (draft ${draft})` : ""}${b.rules ? " (test rules)" : ""}${b.builder ? " (test builder)" : ""}`);
      return makeResume(lines, profile, report.job_data, null, report.company_data, {
        rules: typeof b.rules === "string" && b.rules.trim() ? b.rules : draftRules,
        builder: typeof b.builder === "string" && b.builder.trim() ? b.builder : draftBuilder,
        onBuilt: (s) => { built = s; },
        onRaw: (o) => { raw = o; },
      }).catch((e) => ({ failed: String(e?.message || e) }) as any);
    });
    const levels = Object.fromEntries((profile?.skills || []).map((s: { name: string; level: number }) => [s.name.toLowerCase(), s.level]));
    const applied = res && !res.failed ? buildDiff(res, levels, () => true).final.filter((l: string) => l.trim()) : null;
    await save({
      status: "done",
      job: { id: job.id, title: report.job_data?.title || job.title, company: report.company_data?.name || job.company },
      draft: draft || null,
      seconds: Math.round((Date.now() - t0) / 1000),
      failed: res?.failed || null,
      built_prompt: built,
      raw,
      before: lines,
      after: applied,
    });
  });
  return NextResponse.json({ run });
}

/** GET ?run=<id>: the saved result of a test run, or { status: "running" }. */
export async function GET(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "not_admin" }, { status: 403 });
  const run = new URL(req.url).searchParams.get("run") || "";
  if (!/^[0-9a-f-]{36}$/.test(run)) return NextResponse.json({ error: "bad_run" }, { status: 400 });
  const { data } = await adminClient().storage.from("resumes").download(`test-runs/${run}.json`);
  if (!data) return NextResponse.json({ error: "no_run" }, { status: 404 });
  return new NextResponse(await data.text(), { headers: { "content-type": "application/json" } });
}
