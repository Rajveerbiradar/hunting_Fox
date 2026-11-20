import { adminClient } from "@/lib/supabase/clients";
import { decrypt, setting } from "@/lib/secrets";
import { jlog } from "@/lib/joblog";

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
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Why a run that returned no items didn't really succeed ("FAILED: <message>"), or null when it truly found nothing. */
async function emptyRunReason(actorId: string, token: string, since: number): Promise<string | null> {
  try {
    const r = await fetch(`https://api.apify.com/v2/acts/${actorId}/runs?token=${token}&desc=1&limit=5`, { signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return null;
    const runs = ((await r.json())?.data?.items || []) as { status: string; startedAt: string; statusMessage?: string; id: string }[];
    const mine = runs.filter((x) => new Date(x.startedAt).getTime() >= since - 3000);
    const bad = mine.find((x) => x.status !== "SUCCEEDED" && x.status !== "RUNNING" && x.status !== "READY");
    if (bad) return `${bad.status.toLowerCase()}${bad.statusMessage ? `: ${bad.statusMessage.slice(0, 200)}` : ""} (run ${bad.id})`;
    // Succeeded, but the actor itself says it stopped early (free plan cap, limit reached).
    const capped = mine.find((x) => /limit|credit|free (plan|user|tier)|upgrade|paid|exceed/i.test(x.statusMessage || ""));
    return capped ? `stopped early: ${capped.statusMessage!.slice(0, 200)} (run ${capped.id})` : null;
  } catch {
    return null;
  }
}

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
    if (r.ok) { const items = (await r.json()) as T[]; await jlog("info", "apify", `${actor} on student's own key OK · ${Array.isArray(items) ? items.length : 0} items`); return { items, label: "own" }; }
    const text = await r.text();
    await jlog("warn", "apify", `${actor} on student's own key failed · ${r.status} ${text.slice(0, 200)}`);
    const e = new Error(`Own Apify key: ${r.status} ${text.slice(0, 200)}`) as Error & { ownKeyOut?: boolean };
    e.ownKeyOut = [401, 402, 403].includes(r.status) || /usage|limit|credit|insufficient/i.test(text);
    throw e;
  }
  const toks = await pool();
  if (!toks.length) { await jlog("error", "apify", "No Apify accounts. Add one in /admin → API keys."); throw new Error("No Apify tokens. Add one in /admin → API keys."); }
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
    // Same account, up to 3 tries, but only for "busy" or "broken right now" answers (network, 408, 429, 5xx).
    let moveOn = false;
    for (let attempt = 1; attempt <= 3 && !moveOn; attempt++) {
      if (attempt > 1) { await sleep(attempt === 2 ? 1500 : 4000); await jlog("info", "apify", `Retrying ${actor} on "${t.label}" (try ${attempt} of 3)`); }
      const t0 = Date.now();
      if (attempt === 1) await jlog("info", "apify", `${actor} on account "${t.label}"`);
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
        await jlog("warn", "apify", `${actor} on "${t.label}" network error after ${Date.now() - t0} ms: ${lastErr.slice(0, 200)}`);
        // A timeout means the run may still be going and costing money: never start it again, here or on another account.
        if (/TimeoutError|aborted/i.test(lastErr)) throw new Error(`Apify ${actor} timed out`);
        continue; // network hiccup: same account again
      }
      if (r.ok) {
        const items = (await r.json()) as T[];
        const n = Array.isArray(items) ? items.length : 0;
        await jlog("info", "apify", `${actor} on "${t.label}" OK · ${n} items · ${Date.now() - t0} ms`);
        // An empty answer isn't always "nothing found": a run that failed at once (account out of free usage, actor
        // not allowed on this plan, actor error) also comes back as [] from the sync endpoint. Look at the run
        // itself; if it didn't succeed, say why and try the next account (20 Nov: HDFC Bank, 10,001+ people,
        // came back empty in 1.5 s three times on one account; the same input found people on another).
        if (n === 0) {
          const why = await emptyRunReason(id, t.token, t0);
          if (why) {
            lastErr = `${t.label}: ${why}`;
            await jlog("warn", "apify", `${actor} on "${t.label}" came back empty because the run ${why}. Trying the next account`);
            if (/limit|credit|usage|plan|paid|insufficient|exceed/i.test(why)) await markExhausted(t.label);
            moveOn = true;
            break;
          }
        }
        return { items, label: t.label };
      }
      const text = await r.text();
      lastErr = `${t.label}: ${r.status} ${text.slice(0, 200)}`;
      await jlog("warn", "apify", `${actor} failed · ${lastErr}`);
      // Out of credit, over the limit, or a bad/revoked key: retrying won't help. Park it and use the next account.
      if ([401, 402, 403].includes(r.status) || /usage|limit|credit|insufficient|token/i.test(text)) {
        await markExhausted(t.label);
        moveOn = true;
        break;
      }
      // Wrong input won't work on any account.
      if (r.status === 400 && !/limit|credit/i.test(text)) throw new Error(lastErr);
      // 408 / 429 / 5xx: busy or broken right now. Loop tries the same account again.
    }
  }
  throw new Error(`All Apify tokens failed: ${lastErr}`);
}
