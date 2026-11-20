import { adminClient } from "@/lib/supabase/clients";

export type VersionSource = "upload" | "setup_fix" | "setup_add" | "setup_undo" | "make_main" | "undo_main";

/**
 * Keep a copy of the student's main resume after every change (migration 009), for the admin's resume history.
 * Never throws: if the table isn't there yet, saving the resume still works. A change that leaves the resume
 * exactly as the last copy isn't stored twice.
 */
export async function recordVersion(userId: string, v: { source: VersionSource; lines: string; note?: string | null; raw?: string | null; filePath?: string | null; jobId?: string | null }) {
  try {
    const sb = adminClient();
    const { data: last } = await sb.from("resume_versions").select("lines").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (last && last.lines === v.lines && v.source !== "upload") return;
    await sb.from("resume_versions").insert({
      user_id: userId, source: v.source, lines: v.lines, note: v.note?.slice(0, 4000) || null,
      raw: v.raw?.slice(0, 30000) || null, file_path: v.filePath || null, job_id: v.jobId || null,
    });
  } catch (e) {
    console.error("[resume history] not saved (migration 009 not run?)", (e as Error)?.message);
  }
}
