import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import path from "node:path";

// One task per call. Writing goes to Haiku; decisions (ranking, yes/no) go to
// Cloudflare's decision model when configured, else Haiku.

const WRITER_MODEL = process.env.WRITER_MODEL || "claude-haiku-5-5";

let _anthropic: Anthropic | null = null;
function anthropic() {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
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

/**
 * Haiku call with a cached system prompt. The system prompt never changes between
 * calls, so it's marked for caching; only the short user input is new each time.
 */
export async function writer<T>(promptName: string, input: unknown, maxTokens = 1200): Promise<T> {
  const res = await anthropic().messages.create({
    model: WRITER_MODEL,
    max_tokens: maxTokens,
    temperature: 0.3,
    system: [{ type: "text", text: prompt(promptName), cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: JSON.stringify(input) }],
  });
  const text = res.content.map((c) => (c.type === "text" ? c.text : "")).join("");
  return parseJson<T>(text);
}

/**
 * Decision call (ranking / yes-no). Uses Cloudflare Workers AI when CF_ACCOUNT_ID,
 * CF_API_TOKEN and CF_DECISION_MODEL are set; falls back to Haiku on any error.
 */
export async function decide<T>(promptName: string, input: unknown): Promise<T> {
  const acct = process.env.CF_ACCOUNT_ID;
  const tok = process.env.CF_API_TOKEN;
  const model = process.env.CF_DECISION_MODEL;
  if (acct && tok && model) {
    try {
      const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${acct}/ai/run/${model}`, {
        method: "POST",
        headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" },
        body: JSON.stringify({
          messages: [
            { role: "system", content: prompt(promptName) },
            { role: "user", content: JSON.stringify(input) },
          ],
        }),
        signal: AbortSignal.timeout(30_000),
      });
      const j = await r.json();
      const out = j?.result?.response ?? j?.result?.output ?? j?.result;
      return typeof out === "string" ? parseJson<T>(out) : (out as T);
    } catch (e) {
      console.warn("Decision model failed, falling back to writer:", e);
    }
  }
  return writer<T>(promptName, input, 800);
}
