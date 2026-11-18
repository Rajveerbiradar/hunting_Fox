import OpenAI from "openai";
import { readFileSync } from "node:fs";
import path from "node:path";
import { adminClient } from "@/lib/supabase/clients";
import { decrypt, setting } from "@/lib/secrets";
import { jlog } from "@/lib/joblog";

// Every AI call goes through the OpenAI SDK, so any provider that speaks the OpenAI
// format works: Anthropic, OpenAI, OpenRouter, Groq, Cloudflare Workers AI and others.
// One task per call. Providers are tried in order; if one fails the next takes over.

export type Provider = { id: string; name: string; baseURL: string; apiKey: string; model: string };

/** Providers added in /admin, in order, then the env fallback (AI_BASE_URL + AI_API_KEY + AI_MODEL). */
export async function providers(): Promise<Provider[]> {
  const out: Provider[] = [];
  try {
    const { data } = await adminClient().from("ai_providers").select("id,name,base_url,key_enc,model").order("position");
    (data || []).forEach((r) => {
      try { out.push({ id: r.id, name: r.name, baseURL: r.base_url, apiKey: decrypt(r.key_enc), model: r.model }); } catch { /* unreadable */ }
    });
  } catch { /* table missing: env only */ }
  const envKey = process.env.AI_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (envKey) {
    out.push({
      id: "env",
      name: "From Vercel settings",
      baseURL: process.env.AI_BASE_URL || "https://api.anthropic.com/v1/",
      apiKey: envKey,
      model: process.env.AI_MODEL || process.env.WRITER_MODEL || "claude-haiku-5-5",
    });
  }
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const clients = new Map<string, OpenAI>();
function client(p: { baseURL: string; apiKey: string }) {
  const k = p.baseURL + "|" + p.apiKey;
  if (!clients.has(k)) clients.set(k, new OpenAI({ baseURL: p.baseURL, apiKey: p.apiKey, timeout: 60_000, maxRetries: 0 }));
  return clients.get(k)!;
}

const promptCache = new Map<string, string>();
export function prompt(name: string): string {
  if (!promptCache.has(name)) {
    promptCache.set(name, readFileSync(path.join(process.cwd(), "prompts", `${name}.md`), "utf8"));
  }
  return promptCache.get(name)!;
}

/** Pull the first JSON object or array out of a model reply. */
export function parseJson<T>(text: string): T {
  const start = text.search(/[[{]/);
  if (start < 0) throw new Error("No JSON in model reply");
  const open = text[start];
  const close = open === "{" ? "}" : "]";
  const end = text.lastIndexOf(close);
  return JSON.parse(text.slice(start, end + 1)) as T;
}

/** One chat call. Asks for JSON mode; providers that don't support it are asked again without it. */
async function chat(p: Provider, system: string, user: string, maxTokens: number, temperature = 0.3) {
  const base = {
    model: p.model,
    max_tokens: maxTokens,
    temperature,
    messages: [
      { role: "system" as const, content: system },
      { role: "user" as const, content: user },
    ],
  };
  let r;
  try {
    r = await client(p).chat.completions.create({ ...base, response_format: { type: "json_object" } });
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status !== 400 && status !== 422) throw e;
    r = await client(p).chat.completions.create(base);
  }
  // A reply that hit the token limit is cut off mid-JSON: asking again with the same limit only wastes another minute.
  if (r.choices[0]?.finish_reason === "length") throw Object.assign(new Error(`Reply cut off at ${maxTokens} tokens`), { cutOff: true });
  return r.choices[0]?.message?.content || "";
}

async function markProvider(id: string, ok: boolean, err?: string) {
  if (id === "env" || id === "own") return;
  await adminClient().from("ai_providers").update({ ok, last_error: err?.slice(0, 300) || null, checked_at: new Date().toISOString() }).eq("id", id);
}

/** Run a task on the chosen provider first, then every other one in order. */
async function run<T>(task: "writer" | "ranker", promptName: string, input: unknown, maxTokens: number, own?: Provider | null): Promise<T> {
  const list = await providers();
  const pick = await setting(task === "writer" ? "writer_provider" : "ranker_provider", "");
  const ordered = [
    ...(own ? [own] : []),
    ...list.filter((p) => p.id === pick),
    ...list.filter((p) => p.id !== pick),
  ];
  if (!ordered.length) { await jlog("error", "ai", "No AI provider. Add one in /admin → API keys."); throw new Error("No AI provider. Add one in /admin → API keys."); }
  let last: unknown;
  for (const p of ordered) {
    // Same provider, up to 3 tries, but only when it's busy or broken right now (network, 408, 429, 5xx)
    // or replied with something that isn't JSON. A wrong key, missing model or no credit moves on at once.
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (attempt > 1) { await sleep(attempt === 2 ? 1000 : 3000); await jlog("info", "ai", `Retrying ${promptName} on ${p.name} (try ${attempt} of 3)`); }
      const t0 = Date.now();
      try {
        // Messages need variety and a human voice; everything else stays steady.
        const text = await chat(p, prompt(promptName), JSON.stringify(input), maxTokens, promptName === "write-messages" ? 0.7 : 0.3);
        const out = parseJson<T>(text);
        await jlog("info", "ai", `${promptName} on ${p.name} (${p.model}) OK in ${((Date.now() - t0) / 1000).toFixed(1)}s, ${text.length} characters`);
        if (p.id !== "own") void markProvider(p.id, true);
        return out;
      } catch (e) {
        last = e;
        const status = (e as { status?: number }).status;
        const msg = String((e as { message?: string })?.message || e);
        await jlog("warn", "ai", `${promptName} on ${p.name} (${p.model}) failed after ${((Date.now() - t0) / 1000).toFixed(1)}s${status ? ` (${status})` : ""}: ${msg.slice(0, 300)}`);
        // Only a busy or broken provider is worth asking again. A cut-off or unreadable reply would just repeat.
        const badReply = (e as { cutOff?: boolean }).cutOff || e instanceof SyntaxError || /No JSON/.test(msg);
        if (badReply) break;
        const worthRetry = status === undefined || status === 408 || status === 429 || status >= 500;
        if (!worthRetry || /quota|insufficient|credit|billing/i.test(msg)) break;
        if (attempt === 3) void markProvider(p.id, false, msg);
      }
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

/** Writing tasks: resume profile, resume changes, personal lines. */
export function writer<T>(promptName: string, input: unknown, maxTokens = 1200, own?: Provider | null) {
  return run<T>("writer", promptName, input, maxTokens, own);
}

/** Small decisions: ranking people. Can point at a cheaper or free model. */
export function decide<T>(promptName: string, input: unknown, own?: Provider | null) {
  return run<T>("ranker", promptName, input, 800, own);
}

/** Test a provider before it's saved: one tiny request that must come back in the OpenAI chat format. */
export async function testProvider(p: { baseURL: string; apiKey: string; model: string }) {
  if (!/^https:\/\/.+\/v1\/?$/.test(p.baseURL)) {
    return { ok: false as const, title: "This doesn't look like an OpenAI-style address", text: "The base URL should start with https:// and end in /v1, like https://api.openai.com/v1.", code: "Base URL check failed before sending" };
  }
  const started = Date.now();
  try {
    const r = await client(p).chat.completions.create({
      model: p.model,
      max_tokens: 10,
      messages: [{ role: "user", content: 'Reply with exactly {"ok":true}' }],
    });
    if (r?.object !== "chat.completion" && !r?.choices?.length) {
      return { ok: false as const, title: "It replied, but not in the OpenAI format", text: "Check that the base URL ends in /v1 and points at the provider's OpenAI-compatible API.", code: "No choices in the reply" };
    }
    return {
      ok: true as const,
      ms: Date.now() - started,
      lines: [`Replied in ${Date.now() - started} ms`, `Model ${p.model} is available`, "Replies in the OpenAI chat format"],
      json: JSON.stringify({ id: r.id, object: r.object, model: r.model, choices: r.choices?.map((c) => ({ index: c.index, message: c.message, finish_reason: c.finish_reason })), usage: r.usage }, null, 2),
    };
  } catch (e) {
    const status = (e as { status?: number }).status;
    const msg = String((e as { message?: string }).message || e);
    if (status === 401 || status === 403) return { ok: false as const, title: "The provider didn't accept this key", text: "Copy the key again from the provider's dashboard and paste it here.", code: `${status} · invalid key` };
    if (status === 404 || /model/i.test(msg)) return { ok: false as const, title: "The key works, but that model wasn't found", text: `There's no model called "${p.model}" here. Check the spelling on the provider's models page.`, code: `${status ?? ""} · model_not_found` };
    if (status === 402 || status === 429) return { ok: false as const, title: "The key works, but there's no credit on it", text: "Add credit on the provider's billing page, then test again.", code: `${status} · ${msg.slice(0, 80)}` };
    return { ok: false as const, title: "Couldn't reach the provider", text: "Check the base URL, then test again.", code: msg.slice(0, 120) };
  }
}
