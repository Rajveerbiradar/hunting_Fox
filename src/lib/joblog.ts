import { AsyncLocalStorage } from "node:async_hooks";
import { adminClient } from "@/lib/supabase/clients";

// Which job the current code is working for, so Apify and AI calls can log without passing the id around.
export const jobCtx = new AsyncLocalStorage<{ jobId: string; started: number }>();

/**
 * One line in the job's log: saved to job_logs (Admin → Jobs → Log) and printed to Vercel's logs.
 * Never throws: logging must not break a scan.
 */
export async function jlog(level: "info" | "warn" | "error", step: string, msg: string, jobId?: string) {
  const ctx = jobCtx.getStore();
  const id = jobId || ctx?.jobId;
  const ms = ctx ? Date.now() - ctx.started : null;
  const line = `[job ${id?.slice(0, 8) ?? "-"}] ${level.toUpperCase()} ${step}: ${msg}`;
  if (level === "error") console.error(line); else if (level === "warn") console.warn(line); else console.log(line);
  if (!id) return;
  try {
    await adminClient().from("job_logs").insert({ job_id: id, level, step, msg: msg.slice(0, 2000), ms });
  } catch { /* table missing or db down: Vercel logs still have it */ }
}
