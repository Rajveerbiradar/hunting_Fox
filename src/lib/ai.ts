import OpenAI from "openai";
import { readFileSync } from "node:fs";
import path from "node:path";
import { adminClient } from "@/lib/supabase/clients";
import { decrypt, setting } from "@/lib/secrets";
import { jlog } from "@/lib/joblog";
import { AiBudgetError, checkBudget, recordUsage } from "@/lib/usage";

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
/** Settings a model refused (e.g. Sonnet 5.5: "`temperature` is deprecated for this model"), per model. Never sent again. */
const refused = new Map<string, Set<string>>();

/**
 * No per-task caps: every call may write up to the model's own output limit (you pay only for what it writes).
 * If a model's limit is lower, its 400 names it and we use the lower number. Length is controlled by the prompts.
 */
const OUT = 32_000;
type Tokens = { tokensIn: number; tokensOut: number; estimated: boolean };
const outLimit = new Map<string, number>();

async function chat(p: Provider, system: string, user: string, temperature = 0.3): Promise<{ text: string; tokens: Tokens }> {
  const base = {
    model: p.model,
    max_tokens: outLimit.get(p.model) || OUT,
    messages: [
      { role: "system" as const, content: system },
      { role: "user" as const, content: user },
    ],
  };
  // Streamed: the reply arrives piece by piece, so a long answer is never cut off by a request timeout.
  // We only give up if nothing starts within 60 s.
  const open = (body: object) => client(p).chat.completions.create({ ...base, ...body, stream: true } as never, { timeout: 60_000 }) as unknown as Promise<AsyncIterable<{ choices: { delta?: { content?: string | null }; finish_reason?: string | null }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } | null }>>;
  // Optional extras. Newer models reject some of them with a 400: drop the one the error names (or JSON mode
  // first if it names none) and ask again, and remember it for this model.
  const no = refused.get(p.model) || new Set<string>();
  refused.set(p.model, no);
  const extras: Record<string, unknown> = { temperature, response_format: { type: "json_object" }, stream_options: { include_usage: true } };
  let stream;
  for (let i = 0; ; i++) {
    const body = Object.fromEntries(Object.entries(extras).filter(([k]) => !no.has(k)));
    try { stream = await open(body); break; } catch (e) {
      const status = (e as { status?: number }).status;
      const msg = String((e as Error)?.message || "");
      const left = Object.keys(body);
      const lim = /max_tokens/i.test(msg) ? Number((msg.match(/(\d{3,6})(?!.*\d{3,6})/) || [])[1]) : 0;
      if ((status === 400 || status === 422) && lim && lim < (outLimit.get(p.model) || OUT) && i < 3) { outLimit.set(p.model, lim); base.max_tokens = lim; continue; }
      if ((status !== 400 && status !== 422) || !left.length || i > 2) throw e;
      no.add(left.find((k) => msg.includes(k)) || (left.includes("response_format") ? "response_format" : left[0]));
    }
  }
  let text = "", finish: string | null | undefined;
  let usage: { prompt_tokens?: number; completion_tokens?: number } | null = null;
  for await (const chunk of stream) {
    text += chunk.choices?.[0]?.delta?.content || "";
    finish = chunk.choices?.[0]?.finish_reason || finish;
    if (chunk.usage) usage = chunk.usage;
  }
  // Tokens used, as the provider reports them; if it doesn't, counted from the text (about 4 characters a token).
  const tokens = usage?.prompt_tokens || usage?.completion_tokens
    ? { tokensIn: usage.prompt_tokens || 0, tokensOut: usage.completion_tokens || 0, estimated: false }
    : { tokensIn: Math.ceil((system.length + user.length) / 4), tokensOut: Math.ceil(text.length / 4), estimated: true };
  // A reply that hit the token limit is cut off mid-JSON: asking again with the same limit only wastes time.
  if (finish === "length") throw Object.assign(new Error(`Reply reached the model's output limit (${outLimit.get(p.model) || OUT} tokens)`), { cutOff: true, tokens });
  return { text, tokens };
}

async function markProvider(id: string, ok: boolean, err?: string) {
  if (id === "env" || id === "own") return;
  await adminClient().from("ai_providers").update({ ok, last_error: err?.slice(0, 300) || null, checked_at: new Date().toISOString() }).eq("id", id);
}

/**
 * Run a task. When admin picked a provider for it (Admin → API keys → Writing / Ranking), ONLY that one is used:
 * it never quietly falls back to another model (a free DeepSeek writing in place of the Sonnet you chose).
 * With nothing picked, every provider is tried in order. A student's own key always goes first.
 */
async function run<T>(task: "writer" | "ranker", promptName: string, input: unknown, own?: Provider | null, system?: string): Promise<T> {
  const list = await providers();
  const pick = await setting(task === "writer" ? "writer_provider" : "ranker_provider", "");
  const chosen = list.filter((p) => p.id === pick);
  const ordered = [
    ...(own ? [own] : []),
    ...(chosen.length ? chosen : list),
  ];
  if (!ordered.length) { await jlog("error", "ai", "No AI provider. Add one in /admin → API keys."); throw new Error("No AI provider. Add one in /admin → API keys."); }
  let last: unknown;
  let lastWhere = "";
  const tried: string[] = [];
  for (const p of ordered) {
    // Same provider, up to 3 tries, but only when it's busy or broken right now (network, 408, 429, 5xx)
    // or replied with something that isn't JSON. A wrong key, missing model or no credit moves on at once.
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (attempt > 1) { await sleep(attempt === 2 ? 1000 : 3000); await jlog("info", "ai", `Retrying ${promptName} on ${p.name} (try ${attempt} of 3)`); }
      const t0 = Date.now();
      try {
        // Messages need variety and a human voice; everything else stays steady.
        // The student's AI budget (not when it's their own key). Stops before any money is spent.
        if (p.id !== "own") await checkBudget();
        const sys = system || prompt(promptName);
        const rec = (t?: Tokens) => { if (t) void recordUsage({ providerId: p.id, providerName: p.name, model: p.model, task: promptName, ...t }); };
        const { text, tokens } = await chat(p, sys, JSON.stringify(input), promptName === "write-messages" ? 0.7 : 0.3)
          .catch((e) => { rec((e as { tokens?: Tokens }).tokens); throw e; });
        rec(tokens);
        const out = parseJson<T>(text);
        await jlog("info", "ai", `${promptName} on ${p.name} (${p.model}) OK in ${((Date.now() - t0) / 1000).toFixed(1)}s, ${text.length} characters`);
        if (p.id !== "own") void markProvider(p.id, true);
        return out;
      } catch (e) {
        if (e instanceof AiBudgetError) throw e;
        last = e;
        lastWhere = `${p.name} (${p.model}), ${((Date.now() - t0) / 1000).toFixed(0)}s`;
        tried.push(`${p.id === "own" ? "your own key: " : ""}${lastWhere}: ${String((e as Error)?.message || e).slice(0, 90)}`);
        const status = (e as { status?: number }).status;
        const msg = String((e as { message?: string })?.message || e);
        await jlog("warn", "ai", `${promptName} on ${p.name} (${p.model}) failed after ${((Date.now() - t0) / 1000).toFixed(1)}s${status ? ` (${status})` : ""}: ${msg.slice(0, 300)}`);
        // Only a busy or broken provider is worth asking again. A cut-off or unreadable reply would just repeat.
        // A timed-out reply would just time out again on the same provider: move on instead.
        const badReply = (e as { cutOff?: boolean }).cutOff || e instanceof SyntaxError || /No JSON|timed out|timeout|gave up/i.test(msg) || (e as { name?: string }).name === "APIConnectionTimeoutError";
        if (badReply) break;
        const worthRetry = status === undefined || status === 408 || status === 429 || status >= 500;
        if (!worthRetry || /quota|insufficient|credit|billing/i.test(msg)) break;
        if (attempt === 3) void markProvider(p.id, false, msg);
      }
    }
  }
  // Every attempt, in order, so the student (and the log) can see exactly which AI was asked and why it failed.
  throw new Error(tried.length ? `Tried ${[...new Set(tried)].join(" · then ")}` : String((last as Error)?.message || last));
}

/** Writing tasks: resume profile, resume changes, personal lines. */
export function writer<T>(promptName: string, input: unknown, _maxTokens?: number, own?: Provider | null) {
  return run<T>("writer", promptName, input, own);
}

/**
 * Two steps for writing: first the AI reads everything we know and writes a fresh, detailed system prompt
 * for this exact task (prompts/build-prompt.md, Morning Espresso structure, using the task's own prompt file
 * as the rules it must keep). Then a second call follows that prompt. No two prompts are the same.
 */
export async function writerBuilt<T>(promptName: string, input: unknown, own?: Provider | null): Promise<T> {
  const built = await run<{ system_prompt: string }>("writer", "build-prompt", { task: promptName, rules: prompt(promptName), data: input }, own);
  const sys = (built?.system_prompt || "").trim();
  if (sys.length < 400) throw new Error("The prompt-writing step returned an empty prompt");
  await jlog("info", "ai", `Built a ${sys.length}-character prompt for ${promptName}`);
  return run<T>("writer", promptName, input, own, sys);
}

/** Small decisions: ranking people. Can point at a cheaper or free model. */
export function decide<T>(promptName: string, input: unknown, own?: Provider | null) {
  return run<T>("ranker", promptName, input, own);
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
