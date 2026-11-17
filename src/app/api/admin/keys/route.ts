import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/clients";
import { requireAdmin } from "@/lib/admin";
import { decrypt, encrypt, last4, saveSetting, settings } from "@/lib/secrets";
import { checkToken } from "@/lib/apify";

const SETTINGS = ["anthropic_key", "writer_model", "cf_account_id", "cf_api_token", "cf_decision_model"] as const;
const SECRET = new Set(["anthropic_key", "cf_api_token"]);
const ENV: Record<string, string> = { anthropic_key: "ANTHROPIC_API_KEY", writer_model: "WRITER_MODEL", cf_account_id: "CF_ACCOUNT_ID", cf_api_token: "CF_API_TOKEN", cf_decision_model: "CF_DECISION_MODEL" };

/** Never returns a key: only its last 4 characters. */
async function overview() {
  const sb = adminClient();
  const { data: rows } = await sb.from("apify_tokens").select("label,last4,exhausted,remaining_usd,rows_used_month,added_at,token_enc,last_checked_at").order("added_at");
  const envToks = (process.env.APIFY_TOKENS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const apify = (rows || []).filter((r) => r.token_enc).map((r) => ({ label: r.label, last4: r.last4, exhausted: r.exhausted, remaining: r.remaining_usd, rows: r.rows_used_month, checked: r.last_checked_at, source: "admin" as const }));
  envToks.forEach((s, i) => {
    const at = s.indexOf(":");
    const label = at > 0 && !s.startsWith("apify_api_") ? s.slice(0, at) : "env" + (i + 1);
    if (apify.some((a) => a.label === label)) return;
    const st = (rows || []).find((r) => r.label === label);
    apify.push({ label, last4: last4(s), exhausted: !!st?.exhausted, remaining: st?.remaining_usd ?? null, rows: st?.rows_used_month ?? 0, checked: st?.last_checked_at ?? null, source: "env" as never });
  });
  const vals = await settings();
  const conf = Object.fromEntries(SETTINGS.map((n) => {
    const v = vals[n] || process.env[ENV[n]] || "";
    return [n, { set: !!v, source: vals[n] ? "admin" : v ? "env" : "none", show: SECRET.has(n) ? (v ? `••••${last4(v)}` : "") : v }];
  }));
  return { apify, settings: conf };
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

  if (b.type === "apify_save") {
    if (!label || !token) return NextResponse.json({ error: "Add a name and a token." }, { status: 400 });
    const c = await checkToken(token);
    if (!c.ok && /doesn't work/.test(c.error || "")) return NextResponse.json({ error: c.error }, { status: 400 });
    await sb.from("apify_tokens").upsert({
      label, token_enc: encrypt(token), last4: last4(token), exhausted: c.ok ? (c.remaining ?? 1) < 0.05 : false,
      remaining_usd: c.ok ? c.remaining : null, last_checked_at: new Date().toISOString(), added_at: new Date().toISOString(),
    });
  } else if (b.type === "apify_remove") {
    await sb.from("apify_tokens").delete().eq("label", label);
  } else if (b.type === "apify_check") {
    const { data: row } = await sb.from("apify_tokens").select("token_enc").eq("label", label).maybeSingle();
    const env = (process.env.APIFY_TOKENS || "").split(",").map((s) => s.trim()).find((s) => s.startsWith(label + ":"));
    const tok = row?.token_enc ? decrypt(row.token_enc) : env ? env.slice(label.length + 1) : "";
    if (tok) {
      const c = await checkToken(tok);
      await sb.from("apify_tokens").upsert({ label, remaining_usd: c.ok ? c.remaining : null, exhausted: c.ok ? (c.remaining ?? 0) < 0.05 : true, last_checked_at: new Date().toISOString() });
      if (!c.ok) return NextResponse.json({ ...(await overview()), error: c.error }, { status: 200 });
    }
  } else if (b.type === "apify_unpark") {
    await sb.from("apify_tokens").update({ exhausted: false }).eq("label", label);
  } else if (b.type === "setting") {
    if (!SETTINGS.includes(b.name)) return NextResponse.json({ error: "Unknown setting" }, { status: 400 });
    const value = String(b.value ?? "").trim();
    if (b.name === "anthropic_key" && value) {
      const r = await fetch("https://api.anthropic.com/v1/models", { headers: { "x-api-key": value, "anthropic-version": "2023-06-01" } }).catch(() => null);
      if (r && r.status === 401) return NextResponse.json({ error: "Anthropic says this key doesn't work. Copy it again." }, { status: 400 });
    }
    await saveSetting(b.name, value);
  } else {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
  return NextResponse.json(await overview());
}
