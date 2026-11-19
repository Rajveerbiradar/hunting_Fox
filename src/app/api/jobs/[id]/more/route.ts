/* eslint-disable @typescript-eslint/no-explicit-any */
import { companyInput } from "@/lib/pipeline/resume";
import { NextResponse, after } from "next/server";
import { adminClient, currentUser } from "@/lib/supabase/clients";
import { access } from "@/lib/limits";
import { writePerson } from "@/lib/pipeline/run";
import { jlog, jobCtx } from "@/lib/joblog";
import { BUDGET_DONE } from "@/lib/usage";
import { ownKeys } from "@/lib/ownKeys";
import { knownSkills } from "@/lib/pipeline/rules";
import type { Person } from "@/lib/pipeline/types";

export const maxDuration = 300;

/**
 * Write one person's LinkedIn note and email, when the student asks for it.
 * { ids: [id], notes?: string }: with notes (10–600 characters, what only the student knows) the AI blends them with
 * the person's profile, the job and the resume, notes leading; without notes it writes our suggested message from their profile and the student's resume.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  if (!(await access(user.id, user.email)).approved) return NextResponse.json({ error: "pending" }, { status: 403 });
  const sb = adminClient();
  const { data: job } = await sb.from("jobs").select("user_id,title,company").eq("id", id).single();
  if (!job || job.user_id !== user.id) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const [{ data: report }, { data: profile }] = await Promise.all([
    sb.from("reports").select("*").eq("job_id", id).single(),
    sb.from("profiles").select("*").eq("id", user.id).single(),
  ]);
  const people: Person[] = report?.people || [];
  const ctx = {
    role: job.title,
    company: job.company,
    big: report?.size_band === "big",
    studentName: (profile?.resume_profile?.name || profile?.name || "").replace(/\s*\(.*?\)\s*/g, " ").trim(),
    headline: profile?.resume_profile?.headline,
    resumeLink: profile?.resume_text || profile?.resume_profile ? `${(process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "")}/r/${report?.share_token}` : "",
    portfolio: (profile?.links || [])[0]?.url,
    job: { key_skills: report?.job_data?.keySkills, description: report?.job_data?.description },
    companyInfo: companyInput(report?.company_data, job.company),
    team: people.slice(0, 12).map((x) => ({ name: x.name || x.first, title: x.title, headline: x.headline, months: x.months })),
    student: { skills: knownSkills(profile || {}), projects: profile?.resume_profile?.projects, resume: (profile?.resume_text || "").split("\n").filter((l: string) => l.trim()), education: (profile?.education?.length ? profile.education : profile?.resume_profile?.education || []).map((e: { school: string }) => e.school) },
  };
  const b = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(b.ids) ? b.ids.slice(0, 1) : [];
  const notes = typeof b.notes === "string" ? b.notes.trim().slice(0, 600) : "";
  const targets = people.filter((p) => ids.includes(p.id));
  if (!targets.length) return NextResponse.json({ error: "no_person" }, { status: 400 });
  const target = { ...targets[0], asked: notes || undefined };
  const keys = await ownKeys(user.id).catch(() => ({ ai: null }));
  // Marked on the server first, then written in the background: the student can pick other people (each
  // one writes at the same time) or leave the page, and the page picks the result up when it's saved.
  const at = new Date().toISOString();
  await savePerson(id, target.id, (x) => ({ ...x, asked: notes || undefined, writing: { at }, write_error: undefined }));
  after(() => jobCtx.run({ jobId: id, started: Date.now(), userId: user.id }, async () => {
    const t0 = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error("took over 4 minutes")), 240_000); });
    try {
      // The real AI message or a clear error. Never the plain template.
      const w = await Promise.race([writePerson(target, { ...ctx, studentNotes: notes }, profile?.resume_profile || null, keys.ai), late]);
      await jlog("info", "messages", `Wrote ${target.first}'s message${notes ? " with the student's notes" : ""} in ${Math.round((Date.now() - t0) / 1000)}s`);
      await savePerson(id, target.id, () => ({ ...w, asked: notes || undefined, writing: undefined, write_error: undefined }));
    } catch (e: any) {
      const reason = String(e?.message || e).slice(0, 160);
      await jlog("error", "messages", `Couldn't write ${target.first}'s message: ${reason}`);
      // The student sees only "Our AI couldn't respond" (or that their AI budget is used up); the reason is in the log.
      await savePerson(id, target.id, (x) => ({ ...x, writing: undefined, write_error: e?.budget ? BUDGET_DONE : "ai" }));
    } finally { clearTimeout(timer); }
  }));
  const { data: fresh } = await sb.from("reports").select("people").eq("job_id", id).single();
  return NextResponse.json({ people: fresh?.people || people }, { status: 202 });
}

/** The people list as it is now (the reach-out page polls this while messages are being written). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  const sb = adminClient();
  const { data: job } = await sb.from("jobs").select("user_id").eq("id", id).single();
  if (!job || job.user_id !== user.id) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { data: r } = await sb.from("reports").select("people").eq("job_id", id).single();
  return NextResponse.json({ people: r?.people || [] });
}

/**
 * Change one person in reports.people. Several messages can finish at the same moment, so after writing,
 * read back and redo if another save replaced this one (up to 4 tries).
 */
async function savePerson(jobId: string, personId: string, change: (x: Person) => Person) {
  const sb = adminClient();
  for (let t = 0; t < 4; t++) {
    const { data: r } = await sb.from("reports").select("people").eq("job_id", jobId).single();
    const list: Person[] = r?.people || [];
    const next = list.map((x) => (x.id === personId ? change(x) : x));
    const mine = JSON.stringify(next.find((x) => x.id === personId));
    await sb.from("reports").update({ people: next }).eq("job_id", jobId);
    await new Promise((res) => setTimeout(res, 150 + Math.random() * 250));
    const { data: back } = await sb.from("reports").select("people").eq("job_id", jobId).single();
    if (JSON.stringify((back?.people || []).find((x: Person) => x.id === personId)) === mine) return;
  }
}
