import { NextResponse, after } from "next/server";
import { adminClient, currentUser } from "@/lib/supabase/clients";
import { writer } from "@/lib/ai";
import type { ResumeProfile } from "@/lib/pipeline/types";
import { toLines, toProfile, type StructuredResume } from "@/lib/resumeFormat";
import { access } from "@/lib/limits";

export const maxDuration = 180;

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

type Status = { status: "reading" | "done" | "failed"; file_name: string; started_at?: string; missing?: string[]; error?: string; seen?: boolean };

/**
 * Read the resume with AI and save it as the student's resume straight away. Runs on the server after the
 * upload request has answered, so the student can close the page. The result (or the error) is left in
 * pending_resume_profile so the upload card shows it next time they open any page with it.
 */
async function readResume(userId: string, raw: string, path: string, fileName: string) {
  const sb = adminClient();
  try {
    const structured = await writer<StructuredResume>("resume-profile", { resume_text: raw.slice(0, 15000) }, 4000);
    const lines = toLines(structured);
    const profile: ResumeProfile = toProfile(structured);
    if (lines.length < 3) throw new Error("The AI returned an empty resume");
    const { data: p } = await sb.from("profiles").select("education").eq("id", userId).single();
    const done: Status = { status: "done", file_name: fileName, missing: (profile.missing || []).slice(0, 5) };
    await sb.from("profiles").update({
      resume_path: path,
      resume_text: lines.join("\n"),
      resume_profile: { ...profile, file_name: fileName },
      resume_added_at: new Date().toISOString(),
      pending_resume_path: null,
      pending_resume_text: null,
      pending_resume_profile: done,
      // Seed education once from the resume if the student hasn't added any.
      education: (p?.education || []).length ? p!.education : (profile.education || []),
    }).eq("id", userId);
  } catch (e) {
    const msg = String((e as Error)?.message || e);
    console.error("[resume] AI failed:", msg);
    const failed: Status = { status: "failed", file_name: fileName, error: /No AI provider/i.test(msg) ? "no_ai" : "ai_failed" };
    await sb.from("profiles").update({ pending_resume_profile: failed }).eq("id", userId);
  }
}

/** Where the last upload is: reading, done (not yet seen) or failed, plus the current resume lines. */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  const { data: p } = await adminClient().from("profiles").select("pending_resume_profile,resume_text").eq("id", user.id).single();
  let st = (p?.pending_resume_profile || null) as Status | null;
  // A read that never finished (server stopped): treat as failed after 4 minutes.
  if (st?.status === "reading" && st.started_at && Date.now() - new Date(st.started_at).getTime() > 240_000) st = { ...st, status: "failed", error: "ai_failed" };
  return NextResponse.json({ upload: st?.status ? st : null, lines: (p?.resume_text || "").split("\n").filter(Boolean) });
}

/** Upload: check the file, store it, answer at once, then read it with AI in the background. */
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

  const sb = adminClient();
  const path = `${user.id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
  await sb.storage.from("resumes").upload(path, file, { contentType: file.type || "application/octet-stream" });
  const reading: Status = { status: "reading", file_name: file.name, started_at: new Date().toISOString() };
  await sb.from("profiles").update({ pending_resume_profile: reading }).eq("id", user.id);
  after(() => readResume(user.id, raw, path, file.name));
  return NextResponse.json({ upload: reading }, { status: 202 });
}

/** The student has seen the result: clear the notice. */
export async function DELETE() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  await adminClient().from("profiles").update({ pending_resume_path: null, pending_resume_text: null, pending_resume_profile: null }).eq("id", user.id);
  return NextResponse.json({ ok: true });
}
