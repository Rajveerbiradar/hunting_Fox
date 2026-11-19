import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/clients";
import { requireAdmin } from "@/lib/admin";
import { decrypt, encrypt, last4, saveSetting, settings } from "@/lib/secrets";
import { checkToken, pooledCredit } from "@/lib/apify";
import { testProvider } from "@/lib/ai";
import { clefConfig, testClef } from "@/lib/clef";

/** Never returns a key: only its last 4 characters. */
async function overview() {
  const sb = adminClient();
  const [{ data: rows }, { data: provs }, vals, pool] = await Promise.all([
    sb.from("apify_tokens").select("label,last4,exhausted,remaining_usd,start_usd,rows_used_month,added_at,token_enc,last_checked_at").order("added_at"),
    sb.from("ai_providers").select("id,name,base_url,last4,model,position,ok,last_error,checked_at").order("position"),
    settings(),
    pooledCredit().catch(() => ({ left: 0, start: 0, accounts: 0, working: 0 })),
  ]);
  const envToks = (process.env.APIFY_TOKENS || "").split(",").map((s) => s.trim()).filter(Boolean);
  type A = { label: string; last4: string | null; exhausted: boolean; remaining: number | null; start: number | null; rows: number; added: string | null; checked: string | null; source: "admin" | "env" };
  const apify: A[] = (rows || []).filter((r) => r.token_enc).map((r) => ({ label: r.label, last4: r.last4, exhausted: r.exhausted, remaining: r.remaining_usd, start: r.start_usd, rows: r.rows_used_month, added: r.added_at, checked: r.last_checked_at, source: "admin" }));
  envToks.forEach((s, i) => {
    const at = s.indexOf(":");
    const label = at > 0 && !s.startsWith("apify_api_") ? s.slice(0, at) : "env" + (i + 1);
    if (apify.some((a) => a.label === label)) return;
    const st = (rows || []).find((r) => r.label === label);
    apify.push({ label, last4: last4(s), exhausted: !!st?.exhausted, remaining: st?.remaining_usd ?? null, start: st?.start_usd ?? null, rows: st?.rows_used_month ?? 0, added: null, checked: st?.last_checked_at ?? null, source: "env" });
  });
  const envAi = process.env.AI_API_KEY || process.env.ANTHROPIC_API_KEY;
  const ai = (provs || []).map((p) => ({ id: p.id, name: p.name, base: p.base_url, model: p.model, last4: p.last4, ok: p.ok, error: p.last_error, source: "admin" as const }));
  if (envAi) ai.push({ id: "env", name: "From Vercel settings", base: process.env.AI_BASE_URL || "https://api.anthropic.com/v1/", model: process.env.AI_MODEL || process.env.WRITER_MODEL || "claude-haiku-5-5", last4: last4(envAi), ok: true, error: null, source: "env" as never });
  const clef = await clefConfig();
  const usage = await usageBoxes(ai.map((a) => ({ id: a.id, name: a.name, model: a.model })), vals);
  return {
    usage,
    apify, pool, ai, writer: vals.writer_provider || "", ranker: vals.ranker_provider || "", scanMode: vals.scan_mode || "auto",
    clef: clef ? { set: true, accountId: clef.accountId, model: clef.model, last4: last4(clef.token) } : { set: false },
  };
}

/**
 * One usage box per AI provider/model and one for Clef: tokens in/out, calls and cost (from the price per
 * million tokens admin enters) for the last 30 days and all time. A removed model keeps its box for 30 days.
 */
async function usageBoxes(current: { id: string; name: string; model: string }[], vals: Record<string, string>) {
  const sb = adminClient();
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  type Row = { provider_id: string; provider_name: string; model: string; tokens_in: number; tokens_out: number; at: string; estimated: boolean };
  const rows: Row[] = [];
  for (let from = 0; from < 200_000; from += 1000) {
    const { data, error } = await sb.from("ai_usage").select("provider_id,provider_name,model,tokens_in,tokens_out,at,estimated").order("at", { ascending: false }).range(from, from + 999);
    if (error || !data?.length) break;
    rows.push(...(data as Row[]));
    if (data.length < 1000) break;
  }
  const { data: priced } = await sb.from("ai_providers").select("id,price_in,price_out");
  const price = new Map<string, { in: number; out: number }>((priced || []).map((p: { id: string; price_in: number; price_out: number }) => [p.id, { in: Number(p.price_in) || 0, out: Number(p.price_out) || 0 }]));
  price.set("clef", { in: Number(vals.clef_price_in) || 0, out: Number(vals.clef_price_out) || 0 });
  const box = (id: string, name: string, model: string, removed: boolean) => {
    const mine = rows.filter((r) => r.provider_id === id);
    const recent = mine.filter((r) => r.at >= since);
    const sum = (rs: Row[]) => rs.reduce((a, r) => ({ in: a.in + r.tokens_in, out: a.out + r.tokens_out, calls: a.calls + 1 }), { in: 0, out: 0, calls: 0 });
    const p = price.get(id) || { in: 0, out: 0 };
    const cost = (s: { in: number; out: number }) => (s.in * p.in + s.out * p.out) / 1_000_000;
    const m30 = sum(recent), all = sum(mine);
    return { id, name, model, removed, priceIn: p.in, priceOut: p.out, estimated: mine.some((r) => r.estimated), last30: { ...m30, cost: cost(m30) }, all: { ...all, cost: cost(all) }, lastUsed: mine[0]?.at || null };
  };
  const boxes = current.map((c) => box(c.id, c.name, c.model, false));
  // Models removed in the last 30 days (still in the usage log) keep a box.
  const seen = new Set(current.map((c) => c.id).concat("clef", "own"));
  [...new Map(rows.filter((r) => !seen.has(r.provider_id) && r.at >= since).map((r) => [r.provider_id, r])).values()].forEach((r) => boxes.push(box(r.provider_id, r.provider_name, r.model, true)));
  boxes.push(box("clef", "Clef (Cloudflare)", vals.clef_model || "clef-flash", false));
  return boxes;
}

async function tokenFor(label: string) {
  const { data: row } = await adminClient().from("apify_tokens").select("token_enc").eq("label", label).maybeSingle();
  if (row?.token_enc) return decrypt(row.token_enc);
  const env = (process.env.APIFY_TOKENS || "").split(",").map((s) => s.trim()).find((s) => s.startsWith(label + ":"));
  return env ? env.slice(label.length + 1) : "";
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json(await overview());
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const sb = adminClient();
  const label = String(b.label || "").trim().slice(0, 40);
  const token = String(b.token || "").trim();
  const now = new Date().toISOString();

  switch (b.type) {
    // Price per million tokens for a model (or Clef), to show what it has cost.
    case "price": {
      const pin = Math.max(0, Number(b.price_in) || 0), pout = Math.max(0, Number(b.price_out) || 0);
      if (b.id === "clef") { await saveSetting("clef_price_in", String(pin)); await saveSetting("clef_price_out", String(pout)); }
      else {
        const { error } = await sb.from("ai_providers").update({ price_in: pin, price_out: pout }).eq("id", b.id);
        if (error) return NextResponse.json({ error: "Run supabase/migrations/008_ai_usage.sql first" }, { status: 400 });
      }
      return NextResponse.json(await overview());
    }
    // Test only: nothing is saved. Save is unlocked in the page once this passes.
    case "apify_test": {
      if (!token.startsWith("apify_api_")) return NextResponse.json({ ok: false, title: "Apify didn't accept this key", text: "Copy the token again from Apify → Settings → API & Integrations. It starts with apify_api_.", code: "Not an Apify token" });
      const c = await checkToken(token);
      if (!c.ok) return NextResponse.json({ ok: false, title: "Apify didn't accept this key", text: "Copy the token again from Apify → Settings → API & Integrations.", code: c.error });
      if ((c.remaining ?? 0) < 0.05) return NextResponse.json({ ok: false, title: "This account has no credit left", text: "The key is right, but there's $0.00 left this month. It would be skipped straight away.", code: "monthly usage limit reached" });
      return NextResponse.json({ ok: true, remaining: c.remaining, lines: [`$${c.remaining!.toFixed(2)} credit on this account right now. It will be added to your total`, `$${(c.max ?? 5).toFixed(2)} a month on this plan`] });
    }
    case "apify_save": {
      if (!label || !token) return NextResponse.json({ error: "Add a name and a token." }, { status: 400 });
      const c = await checkToken(token);
      if (!c.ok || (c.remaining ?? 0) < 0.05) return NextResponse.json({ error: "Test the key first. It didn't pass." }, { status: 400 });
      await sb.from("apify_tokens").upsert({ label, token_enc: encrypt(token), last4: last4(token), exhausted: false, remaining_usd: c.remaining, start_usd: c.remaining, last_checked_at: now, added_at: now });
      break;
    }
    case "apify_remove":
      await sb.from("apify_tokens").delete().eq("label", label);
      break;
    case "apify_check": {
      const tok = await tokenFor(label);
      if (tok) {
        const c = await checkToken(tok);
        await sb.from("apify_tokens").upsert({ label, remaining_usd: c.ok ? c.remaining : null, exhausted: c.ok ? (c.remaining ?? 0) < 0.05 : true, last_checked_at: now });
        if (!c.ok) return NextResponse.json({ ...(await overview()), error: c.error });
      }
      break;
    }
    case "apify_unpark":
      await sb.from("apify_tokens").update({ exhausted: false }).eq("label", label);
      break;
    case "apify_up": {
      // Order = added_at; swap with the one above.
      const { data: all } = await sb.from("apify_tokens").select("label,added_at").not("token_enc", "is", null).order("added_at");
      const i = (all || []).findIndex((r) => r.label === label);
      if (i > 0 && all) {
        const a = all[i], p = all[i - 1];
        await sb.from("apify_tokens").update({ added_at: p.added_at }).eq("label", a.label);
        await sb.from("apify_tokens").update({ added_at: a.added_at }).eq("label", p.label);
      }
      break;
    }
    case "ai_test":
      return NextResponse.json(await testProvider({ baseURL: String(b.base || "").trim(), apiKey: String(b.key || "").trim(), model: String(b.model || "").trim() }));
    case "ai_save": {
      const p = { baseURL: String(b.base || "").trim(), apiKey: String(b.key || "").trim(), model: String(b.model || "").trim() };
      const name = String(b.name || "").trim().slice(0, 40) || "Provider";
      const t = await testProvider(p);
      if (!t.ok) return NextResponse.json({ error: "Test the key first. It didn't pass." }, { status: 400 });
      if (b.id && b.id !== "env") {
        await sb.from("ai_providers").update({ name, base_url: p.baseURL, key_enc: encrypt(p.apiKey), last4: last4(p.apiKey), model: p.model, ok: true, last_error: null, checked_at: now }).eq("id", b.id);
      } else {
        const { count } = await sb.from("ai_providers").select("id", { count: "exact", head: true });
        await sb.from("ai_providers").insert({ name, base_url: p.baseURL, key_enc: encrypt(p.apiKey), last4: last4(p.apiKey), model: p.model, position: count || 0, checked_at: now });
      }
      break;
    }
    case "ai_check": {
      const { data: r } = await sb.from("ai_providers").select("*").eq("id", b.id).maybeSingle();
      if (r) {
        const t = await testProvider({ baseURL: r.base_url, apiKey: decrypt(r.key_enc), model: r.model });
        await sb.from("ai_providers").update({ ok: t.ok, last_error: t.ok ? null : t.title, checked_at: now }).eq("id", b.id);
        return NextResponse.json({ ...(await overview()), test: t });
      }
      break;
    }
    case "ai_remove":
      await sb.from("ai_providers").delete().eq("id", b.id);
      break;
    // Clef (Cloudflare decision model) for ranking people. Test first; save only if it passes.
    case "clef_test":
    case "clef_save": {
      const cfg = { accountId: String(b.accountId || "").trim(), token: String(b.token || "").trim(), model: (b.model === "clef" ? "clef" : "clef-flash") as "clef" | "clef-flash" };
      if (!cfg.token) { const cur = await clefConfig(); if (cur) cfg.token = cur.token; }
      const t = await testClef(cfg);
      if (b.type === "clef_test") return NextResponse.json(t);
      if (!t.ok) return NextResponse.json({ error: "Test the key first. It didn't pass." }, { status: 400 });
      await Promise.all([saveSetting("clef_account_id", cfg.accountId), saveSetting("clef_token", cfg.token), saveSetting("clef_model", cfg.model)]);
      if (b.useForRanking !== false) await saveSetting("ranker_provider", "clef");
      break;
    }
    case "clef_remove":
      await Promise.all([saveSetting("clef_account_id", ""), saveSetting("clef_token", ""), saveSetting("clef_model", "")]);
      if ((await settings())["ranker_provider"] === "clef") await saveSetting("ranker_provider", "");
      break;
    case "route":
      if (!["writer_provider", "ranker_provider", "scan_mode"].includes(b.name)) return NextResponse.json({ error: "Unknown setting" }, { status: 400 });
      await saveSetting(b.name, String(b.value || ""));
      break;
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
  return NextResponse.json(await overview());
}
