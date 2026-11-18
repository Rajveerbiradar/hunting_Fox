import { NextResponse } from "next/server";
import { adminClient, currentUser } from "@/lib/supabase/clients";
import { encrypt, last4 } from "@/lib/secrets";
import { checkToken } from "@/lib/apify";
import { testProvider } from "@/lib/ai";

// A student's own Apify and AI keys. Tested before saving, stored encrypted,
// only ever used for this student's own searches. Never sent back, only the last 4.

async function overview(userId: string) {
  const { data } = await adminClient().from("user_keys").select("kind,last4,base_url,model,provider,remaining_usd,start_usd,fallback,ok,updated_at").eq("user_id", userId);
  const apify = (data || []).find((r) => r.kind === "apify") || null;
  const ai = (data || []).find((r) => r.kind === "ai") || null;
  return { apify, ai };
}

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  return NextResponse.json(await overview(user.id));
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const sb = adminClient();
  const key = String(b.key || "").trim();
  const now = new Date().toISOString();

  if (b.type === "apify_test" || b.type === "apify_save") {
    if (!key.startsWith("apify_api_")) return NextResponse.json({ ok: false, title: "Apify didn't accept this key", text: "Copy it again from Apify → Settings → API & Integrations. It starts with apify_api_." });
    const c = await checkToken(key);
    if (!c.ok) return NextResponse.json({ ok: false, title: "Apify didn't accept this key", text: "Copy it again from Apify → Settings → API & Integrations." });
    if ((c.remaining ?? 0) < 0.05) return NextResponse.json({ ok: false, title: "This account has no credit left this month", text: "Apify adds $5 of free credit at the start of each month." });
    if (b.type === "apify_test") return NextResponse.json({ ok: true, lines: [`$${c.remaining!.toFixed(2)} of credit left this month`, `About ${Math.floor(c.remaining! / 0.045)} searches' worth`] });
    await sb.from("user_keys").upsert({ user_id: user.id, kind: "apify", key_enc: encrypt(key), last4: last4(key), remaining_usd: c.remaining, start_usd: c.remaining, ok: true, updated_at: now });
  } else if (b.type === "ai_test" || b.type === "ai_save") {
    const p = { baseURL: String(b.base || "").trim(), apiKey: key, model: String(b.model || "").trim() };
    const t = await testProvider(p);
    if (b.type === "ai_test" || !t.ok) return NextResponse.json(t);
    await sb.from("user_keys").upsert({ user_id: user.id, kind: "ai", key_enc: encrypt(key), last4: last4(key), base_url: p.baseURL, model: p.model, provider: String(b.provider || "Your AI").slice(0, 40), ok: true, updated_at: now });
  } else if (b.type === "remove") {
    await sb.from("user_keys").delete().eq("user_id", user.id).eq("kind", b.kind === "ai" ? "ai" : "apify");
  } else if (b.type === "fallback") {
    await sb.from("user_keys").update({ fallback: b.value === "stop" ? "stop" : "free" }).eq("user_id", user.id).eq("kind", "apify");
  } else {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
  return NextResponse.json({ ok: true, ...(await overview(user.id)) });
}
