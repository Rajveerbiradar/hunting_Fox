import { adminClient } from "@/lib/supabase/clients";
import { decrypt, setting } from "@/lib/secrets";

// Token pool: tokens added in /admin (encrypted in apify_tokens), then any in env APIFY_TOKENS="label:token,...".
type Tok = { label: string; token: string };

async function pool(): Promise<Tok[]> {
  const out: Tok[] = [];
  const { data } = await adminClient().from("apify_tokens").select("label,token_enc,added_at").not("token_enc", "is", null).order("added_at");
  (data || []).forEach((r) => {
    try { out.push({ label: r.label, token: decrypt(r.token_enc) }); } catch { /* unreadable: skip */ }
  });
  const seen = new Set(out.map((t) => t.label));
  (process.env.APIFY_TOKENS || "").split(",").map((s) => s.trim()).filter(Boolean).forEach((s, i) => {
    const at = s.indexOf(":");
    const t = at > 0 && !s.startsWith("apify_api_") ? { label: s.slice(0, at), token: s.slice(at + 1) } : { label: "env" + (i + 1), token: s };
    if (!seen.has(t.label)) out.push(t);
  });
  return out;
}

/** Credit left on one token, straight from Apify. */
export async function checkToken(token: string): Promise<{ ok: boolean; remaining?: number; max?: number; error?: string }> {
  try {
    const r = await fetch(`https://api.apify.com/v2/users/me/limits?token=${token}`, { signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return { ok: false, error: r.status === 401 ? "This token doesn't work. Copy it again from Apify." : `Apify said ${r.status}` };
    const j = await r.json();
    const used = j?.data?.current?.monthlyUsageUsd ?? 0;
    const max = j?.data?.limits?.maxMonthlyUsageUsd ?? 5;
    return { ok: true, remaining: Math.max(0, max - used), max };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

const B2B_MONTHLY_ROWS = 500;

async function tokenState() {
  const { data } = await adminClient().from("apify_tokens").select("*");
  const map = new Map<string, { exhausted: boolean; rows_used_month: number; remaining_usd: number | null; last_checked_at: string | null }>();
  (data || []).forEach((r) => map.set(r.label, r));
  return map;
}

async function markExhausted(label: string) {
  await adminClient().from("apify_tokens").upsert({ label, exhausted: true, last_checked_at: new Date().toISOString() });
}

export async function addRows(label: string, rows: number) {
  if (label === "own") return;
  const sb = adminClient();
  const { data } = await sb.from("apify_tokens").select("rows_used_month").eq("label", label).maybeSingle();
  await sb.from("apify_tokens").upsert({ label, rows_used_month: (data?.rows_used_month || 0) + rows });
}

/**
 * Pooled remaining credit, refreshed at most every 10 minutes.
 * Uses GET /v2/users/me/limits (current.monthlyUsageUsd vs limits.maxMonthlyUsageUsd).
 */
export async function pooledRemainingUsd(): Promise<number> {
  const toks = await pool();
  const state = await tokenState();
  const sb = adminClient();
  let total = 0;
  await Promise.all(
    toks.map(async (t) => {
      const s = state.get(t.label);
      const fresh = s?.last_checked_at && Date.now() - new Date(s.last_checked_at).getTime() < 10 * 60_000;
      if (fresh && s?.remaining_usd != null) {
        total += Number(s.remaining_usd);
        return;
      }
      try {
        const r = await fetch(`https://api.apify.com/v2/users/me/limits?token=${t.token}`);
        const j = await r.json();
        const used = j?.data?.current?.monthlyUsageUsd ?? 0;
        const max = j?.data?.limits?.maxMonthlyUsageUsd ?? 5;
        const remaining = Math.max(0, max - used);
        total += remaining;
        await sb.from("apify_tokens").upsert({
          label: t.label,
          remaining_usd: remaining,
          exhausted: remaining < 0.05,
          last_checked_at: new Date().toISOString(),
        });
      } catch {
        // Unknown: assume it still has a little credit.
        total += Number(s?.remaining_usd ?? 1);
      }
    })
  );
  return total;
}

/** Every account's credit added up: what's left now and what they had when they were added. */
export async function pooledCredit() {
  const left = await pooledRemainingUsd();
  const { data } = await adminClient().from("apify_tokens").select("label,start_usd,remaining_usd,exhausted");
  const start = (data || []).reduce((a, r) => a + Number(r.start_usd ?? r.remaining_usd ?? 0), 0);
  return { left, start: Math.max(start, left), accounts: (data || []).length, working: (data || []).filter((r) => !r.exhausted).length };
}

export async function scanMode(): Promise<"full" | "lean"> {
  const m = await setting("scan_mode", "SCAN_MODE");
  if (m === "full" || m === "lean") return m;
  return (await pooledRemainingUsd()) < 5 ? "lean" : "full";
}

/**
 * Run an actor synchronously and return its dataset items.
 * Rotates to the next token on credit or usage-limit errors.
 */
export async function runActor<T = Record<string, unknown>>(
  actor: string,
  input: unknown,
  opts: { timeoutSec?: number; b2bRows?: number; ownToken?: string | null } = {}
): Promise<{ items: T[]; label: string }> {
  // A student's own key: only that key, never the shared pool.
  if (opts.ownToken) {
    const id = actor.replace("/", "~");
    const r = await fetch(`https://api.apify.com/v2/acts/${id}/run-sync-get-dataset-items?token=${opts.ownToken}&timeout=${opts.timeoutSec ?? 120}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input),
      signal: AbortSignal.timeout(((opts.timeoutSec ?? 120) + 15) * 1000),
    });
    if (r.ok) return { items: (await r.json()) as T[], label: "own" };
    const text = await r.text();
    const e = new Error(`Own Apify key: ${r.status} ${text.slice(0, 200)}`) as Error & { ownKeyOut?: boolean };
    e.ownKeyOut = [401, 402, 403].includes(r.status) || /usage|limit|credit|insufficient/i.test(text);
    throw e;
  }
  const toks = await pool();
  if (!toks.length) throw new Error("No Apify tokens. Add one in /admin.");
  const state = await tokenState();
  const usable = toks.filter((t) => {
    const s = state.get(t.label);
    if (s?.exhausted) return false;
    if (opts.b2bRows && (s?.rows_used_month || 0) + opts.b2bRows > B2B_MONTHLY_ROWS) return false;
    return true;
  });
  const order = usable.length ? usable : toks; // if all look exhausted, try anyway
  const id = actor.replace("/", "~");
  let lastErr = "";
  for (const t of order) {
    const url = `https://api.apify.com/v2/acts/${id}/run-sync-get-dataset-items?token=${t.token}&timeout=${opts.timeoutSec ?? 120}`;
    let r: Response;
    try {
      r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(((opts.timeoutSec ?? 120) + 15) * 1000),
      });
    } catch (e) {
      lastErr = String(e);
      // A timeout means the run may still be going and costing money: don't start it again on another account.
      if (/TimeoutError|aborted/i.test(lastErr)) throw new Error(`Apify ${actor} timed out`);
      continue; // network hiccup: try the next token
    }
    if (r.ok) return { items: (await r.json()) as T[], label: t.label };
    const text = await r.text();
    lastErr = `${t.label}: ${r.status} ${text.slice(0, 200)}`;
    console.warn("Apify token failed, trying next", lastErr);
    // Out of credit, over the limit, or a bad/revoked token: park this account and move on.
    if ([401, 402, 403].includes(r.status) || /usage|limit|credit|insufficient|token/i.test(text)) {
      await markExhausted(t.label);
      continue;
    }
    // Wrong input won't work on any account.
    if (r.status === 400 && !/limit|credit/i.test(text)) throw new Error(lastErr);
    // 408 / 429 / 5xx: busy or broken right now, try the next account without parking this one.
  }
  throw new Error(`All Apify tokens failed: ${lastErr}`);
}
