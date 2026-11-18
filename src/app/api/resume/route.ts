import { NextResponse } from "next/server";
import { adminClient, currentUser } from "@/lib/supabase/clients";
import { writer } from "@/lib/ai";
import type { ResumeProfile } from "@/lib/pipeline/types";
import { toLines, toProfile, type StructuredResume } from "@/lib/resumeFormat";
import { access } from "@/lib/limits";

export const maxDuration = 60;

async function textOf(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  if (/\.pdf$/i.test(file.name) || file.type === "application/pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(buf);
    const { text } = await extractText(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join("\n") : text;
  }
  return new TextDecoder().decode(buf); // .md / .txt
}

/** Upload: read the resume once and turn it into a short profile. Saved as pending until confirmed. */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  if (!(await access(user.id, user.email)).approved) return NextResponse.json({ error: "pending" }, { status: 403 });
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "no_file" }, { status: 400 });
  if (file.size > 5_000_000) return NextResponse.json({ error: "too_big" }, { status: 400 });

  let raw = "";
  try {
    raw = (await textOf(file)).replace(/\u0000/g, "").trim();
  } catch (e) {
    console.error("[resume] couldn't read the file", e);
    return NextResponse.json({ error: "unreadable" }, { status: 400 });
  }
  if (raw.length < 80) return NextResponse.json({ error: "unreadable" }, { status: 400 });

  let profile: ResumeProfile;
  let lines: string[];
  try {
    const structured = await writer<StructuredResume>("resume-profile", { resume_text: raw.slice(0, 15000) }, 4000);
    lines = toLines(structured);
    profile = toProfile(structured);
    if (lines.length < 3) throw new Error("The AI returned an empty resume");
  } catch (e) {
    const msg = String((e as Error)?.message || e);
    console.error("[resume] AI failed:", msg);
    return NextResponse.json({ error: /No AI provider/i.test(msg) ? "no_ai" : "ai_failed", detail: msg.slice(0, 200) }, { status: 503 });
  }

  const sb = adminClient();
  const path = `${user.id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
  await sb.storage.from("resumes").upload(path, file, { contentType: file.type || "application/octet-stream" });
  await sb.from("profiles").update({
    pending_resume_path: path,
    pending_resume_text: lines.join("\n"),
    pending_resume_profile: { ...profile, file_name: file.name },
  }).eq("id", user.id);
  return NextResponse.json({ file_name: file.name, lines, profile, missing: (profile.missing || []).slice(0, 5) });
}

/** Confirm: "Yes, use this". */
export async function PUT() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  const sb = adminClient();
  const { data: p } = await sb.from("profiles").select("*").eq("id", user.id).single();
  if (!p?.pending_resume_text) return NextResponse.json({ error: "nothing_pending" }, { status: 400 });
  const rp = p.pending_resume_profile || {};
  await sb.from("profiles").update({
    resume_path: p.pending_resume_path,
    resume_text: p.pending_resume_text,
    resume_profile: rp,
    resume_added_at: new Date().toISOString(),
    pending_resume_path: null,
    pending_resume_text: null,
    pending_resume_profile: null,
    // Seed education once from the resume if the student hasn't added any.
    education: (p.education || []).length ? p.education : (rp.education || []),
  }).eq("id", user.id);
  return NextResponse.json({ ok: true });
}

/** "Something's wrong": drop the pending upload. */
export async function DELETE() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  await adminClient().from("profiles").update({ pending_resume_path: null, pending_resume_text: null, pending_resume_profile: null }).eq("id", user.id);
  return NextResponse.json({ ok: true });
}
