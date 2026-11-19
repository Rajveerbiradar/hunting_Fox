import { adminClient } from "@/lib/supabase/clients";
import { jobCtx } from "@/lib/joblog";

// AI usage: every call is recorded (ai_usage) and, unless the student used their own key, counted against
// their AI budget (profiles.ai_tokens_used / ai_token_limit). Students only ever see a % left, never numbers.

export class AiBudgetError extends Error {
  budget = true;
  constructor() { super(BUDGET_DONE); }
}

/** What a student sees when their AI budget is used up. */
export const BUDGET_DONE =
  "The AI budget allocated to you is finished. AI credits are separate from your search credits. Hunting Fox is a personal project with a limited budget, so please ask the admin for more AI credits.";

/** Stop before spending: throws AiBudgetError when the current student has used their AI budget. */
export async function checkBudget() {
  const userId = jobCtx.getStore()?.userId;
  if (!userId) return;
  const { data } = await adminClient().from("profiles").select("ai_tokens_used,ai_token_limit").eq("id", userId).maybeSingle();
  if (data && data.ai_token_limit > 0 && data.ai_tokens_used >= data.ai_token_limit) throw new AiBudgetError();
}

/** Record one AI call. Never throws. */
export async function recordUsage(u: { providerId: string; providerName: string; model: string; task: string; tokensIn: number; tokensOut: number; estimated: boolean }) {
  const ctx = jobCtx.getStore();
  const sb = adminClient();
  try {
    await sb.from("ai_usage").insert({
      provider_id: u.providerId, provider_name: u.providerName, model: u.model, task: u.task,
      tokens_in: u.tokensIn, tokens_out: u.tokensOut, estimated: u.estimated,
      user_id: ctx?.userId || null, job_id: ctx?.jobId || null,
    });
    // A student's own key is their money, not the budget.
    if (ctx?.userId && u.providerId !== "own") {
      const { data } = await sb.from("profiles").select("ai_tokens_used").eq("id", ctx.userId).maybeSingle();
      if (data) await sb.from("profiles").update({ ai_tokens_used: (data.ai_tokens_used || 0) + u.tokensIn + u.tokensOut }).eq("id", ctx.userId);
    }
  } catch { /* migration 008 not run: calls still work */ }
}

/** % of the AI budget left for a student (0 to 100), for the account page and warnings. */
export async function budgetLeft(userId: string) {
  const { data } = await adminClient().from("profiles").select("ai_tokens_used,ai_token_limit").eq("id", userId).maybeSingle();
  if (!data || !data.ai_token_limit) return { pct: 100, done: false, low: false };
  const pct = Math.max(0, Math.round(100 - (data.ai_tokens_used / data.ai_token_limit) * 100));
  return { pct, done: pct <= 0, low: pct > 0 && pct <= 10 };
}
