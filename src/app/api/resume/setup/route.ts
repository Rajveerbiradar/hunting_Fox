import { NextResponse } from "next/server";
import { adminClient, currentUser } from "@/lib/supabase/clients";
import { writer } from "@/lib/ai";
import { jobCtx } from "@/lib/joblog";
import { access } from "@/lib/limits";
import { groupLines, replaceGroup, sameLines } from "@/lib/resumeGroups";
import type { Fact } from "@/lib/pipeline/resume";

export const maxDuration = 120;

/**
 * Resume setup: the student checks their main resume one part at a time.
 *
 *   GET                                   → { lines, groups, setup }
 *   POST { action:"ok", key }             → this part is right as it is
 *   POST { action:"fix", key, lines, note } → the AI applies the student's note to this part only (prompts/resume-section-fix.md),
 *                                            saves it into the main resume, and keeps the note as a fact for every future job
 *   POST { action:"restore", key, lines, to } → undo: put `to` back where `lines` is now
 *
 * `lines` is the part as the page last saw it; if the resume changed since, the answer is 409 and the page reloads.
 * Setup state lives in resume_profile.setup ({ [key]: { state: "ok" | "edited", at } }), so no migration is needed.
 */

type Setup = Record<string, { state: "ok" | "edited"; at: string }>;

async function load(userId: string) {
  const { data: p } = await adminClient().from("profiles").select("resume_text,resume_profile,facts").eq("id", userId).single();
  const lines = String(p?.resume_text || "").split("\n").filter((l) => l.trim());
  return { p, lines, groups: groupLines(lines), setup: ((p?.resume_profile as { setup?: Setup } | null)?.setup || {}) as Setup };
}

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  const { p, lines, groups, setup } = await load(user.id);
  const missing = ((p?.resume_profile as { missing?: string[] } | null)?.missing || []).slice(0, 5);
  return NextResponse.json({ lines, groups, setup, missing });
}

/** Every line keeps a template marker the resume layout understands, and an entry keeps its title line first. */
function validPart(kind: string, next: string[]) {
  if (!next.length) return kind !== "top" && kind !== "entry";
  if (kind === "entry" && !next[0].trim().startsWith("### ")) return false;
  if (kind === "top" && !next[0].trim().startsWith("# ")) return false;
  return next.every((l) => !l.trim().startsWith("## "));
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  if (!(await access(user.id, user.email)).approved) return NextResponse.json({ error: "pending" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");
  const key = String(body.key || "");

  const { p, lines, groups, setup } = await load(user.id);
  const g = groups.find((x) => x.key === key);
  if (!g) return NextResponse.json({ error: "changed" }, { status: 409 });
  const seen: string[] = Array.isArray(body.lines) ? body.lines.map(String) : [];
  if (action !== "ok" && !sameLines(seen, g.lines)) return NextResponse.json({ error: "changed" }, { status: 409 });

  const sb = adminClient();
  const now = new Date().toISOString();
  const saveProfile = async (nextLines: string[], nextSetup: Setup, extra: Record<string, unknown> = {}) => {
    const rp = { ...((p?.resume_profile as Record<string, unknown>) || {}), setup: nextSetup };
    const { error } = await sb.from("profiles").update({ resume_text: nextLines.join("\n"), resume_profile: rp, ...extra }).eq("id", user.id);
    if (error) throw error;
  };

  if (action === "ok") {
    await saveProfile(lines, { ...setup, [key]: { state: "ok", at: now } });
    return NextResponse.json({ ok: true });
  }

  if (action === "restore") {
    const to: string[] = Array.isArray(body.to) ? body.to.map(String).filter((l: string) => l.trim()) : [];
    if (!validPart(g.kind, to)) return NextResponse.json({ error: "bad" }, { status: 400 });
    const next = replaceGroup(lines, g, to);
    const newKey = groupLines(next).find((x) => x.start === g.start)?.key || key;
    const s = { ...setup }; delete s[key]; delete s[newKey];
    await saveProfile(next, s);
    return NextResponse.json({ ok: true, key: newKey, lines: to });
  }

  if (action === "fix") {
    const note = String(body.note || "").trim().slice(0, 3000);
    if (note.length < 3) return NextResponse.json({ error: "empty" }, { status: 400 });
    let out: { lines?: string[]; changed?: string } | null = null;
    try {
      out = await jobCtx.run({ jobId: "", started: Date.now(), userId: user.id }, () =>
        writer<{ lines?: string[]; changed?: string }>("resume-section-fix", {
          part_title: g.title, section: g.section, lines: g.lines, note, whole_resume: lines,
        }));
    } catch (e) {
      const msg = String((e as Error)?.message || e);
      console.error("[resume setup] AI failed:", msg);
      return NextResponse.json({ error: (e as { budget?: boolean })?.budget ? "budget" : /No AI provider/i.test(msg) ? "no_ai" : "ai_failed" }, { status: 502 });
    }
    const fixed = (Array.isArray(out?.lines) ? out!.lines : []).map((l) => String(l).replace(/\s+$/, "")).filter((l) => l.trim());
    if (!validPart(g.kind, fixed)) return NextResponse.json({ error: "ai_failed" }, { status: 502 });
    const next = replaceGroup(lines, g, fixed);
    const newKey = groupLines(next).find((x) => x.start === g.start)?.key || key;
    const s = { ...setup }; delete s[key]; s[newKey] = { state: "edited", at: now };
    // The note is the student's own word about their work: every future job reads it as a fact.
    const q = `About "${g.title}" on my resume`;
    const facts: Fact[] = Array.isArray(p?.facts) ? p!.facts : [];
    const nextFacts = [...facts.filter((f) => f.q !== q), { q, a: note, at: now }];
    await saveProfile(next, s, { facts: nextFacts });
    return NextResponse.json({ ok: true, key: newKey, lines: fixed, before: g.lines, changed: String(out?.changed || "").slice(0, 300) });
  }

  return NextResponse.json({ error: "bad" }, { status: 400 });
}
