import { setting } from "@/lib/secrets";
import { jlog } from "@/lib/joblog";
import type { Person } from "@/lib/pipeline/types";

// Cloudflare Clef: a decision model. It doesn't write text; it answers typed questions
// about a "state" with probabilities. We use it to rank people and spot real connections.
// Settings (saved in /admin → API keys → Clef): clef_account_id, clef_token, clef_model.

export type ClefConfig = { accountId: string; token: string; model: "clef" | "clef-flash" };

export async function clefConfig(): Promise<ClefConfig | null> {
  const [accountId, token, model] = await Promise.all([
    setting("clef_account_id", "CLEF_ACCOUNT_ID"),
    setting("clef_token", "CLEF_API_TOKEN"),
    setting("clef_model", "CLEF_MODEL"),
  ]);
  if (!accountId || !token) return null;
  return { accountId, token, model: model === "clef" ? "clef" : "clef-flash" };
}

type Question =
  | { type: "noul"; instructions: string }
  | { type: "choice"; instructions: string; criteria: Record<string, string | null> }
  | { type: "score"; instructions: string; criteria: string[] };

type Answer = { type: string; noul?: number; choice?: string; score?: number; probabilities?: Record<string, number>; confidence?: number };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Clef with up to 3 tries on network, 408, 429 and 5xx. A bad token or wrong account fails at once. */
export async function clefAsk(cfg: ClefConfig, state: unknown, questions: Record<string, Question>): Promise<Record<string, Answer>> {
  let last: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (attempt > 1) { await sleep(attempt === 2 ? 1000 : 3000); await jlog("info", "rank", `Retrying Clef (try ${attempt} of 3)`); }
    try {
      return await clefOnce(cfg, state, questions);
    } catch (e) {
      last = e;
      const status = (e as { status?: number }).status;
      if (!(status === undefined || status === 408 || status === 429 || status >= 500)) throw e;
    }
  }
  throw last;
}

/** One call to Clef. Throws with a readable message on any failure. */
async function clefOnce(cfg: ClefConfig, state: unknown, questions: Record<string, Question>): Promise<Record<string, Answer>> {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${cfg.accountId}/ai/run/@cf/cloudflare/${cfg.model}`, {
    method: "POST",
    headers: { authorization: `Bearer ${cfg.token}`, "content-type": "application/json" },
    body: JSON.stringify({ model: cfg.model, state, questions }),
    signal: AbortSignal.timeout(45_000),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.success) {
    const msg = j?.errors?.map((e: { code?: number; message?: string }) => `${e.code ?? ""} ${e.message ?? ""}`.trim()).join("; ") || `HTTP ${r.status}`;
    const err = new Error(`Clef ${r.status}: ${msg}`) as Error & { status?: number };
    err.status = r.status;
    throw err;
  }
  return j.result?.answers || {};
}

/** Test before saving: one tiny yes/no question. */
export async function testClef(cfg: ClefConfig) {
  if (!/^[a-f0-9]{32}$/i.test(cfg.accountId)) return { ok: false as const, title: "That Account ID doesn't look right", text: "It's the 32-character code on Cloudflare → AI → Workers AI → Use REST API." };
  const t0 = Date.now();
  try {
    const a = await clefAsk(cfg, { text: "The sky is blue." }, { blue: { type: "noul", instructions: "Does `text` say the sky is blue?" } });
    const p = a.blue?.noul;
    if (typeof p !== "number") return { ok: false as const, title: "It replied, but not in Clef's format", text: "Check the model is clef or clef-flash." };
    return { ok: true as const, lines: [`Replied in ${Date.now() - t0} ms`, `Model ${cfg.model} works`, `Test answer: ${Math.round(p * 100)}% yes`] };
  } catch (e) {
    const status = (e as { status?: number }).status;
    const msg = String((e as Error).message || e);
    if (status === 401 || status === 403) return { ok: false as const, title: "Cloudflare didn't accept this token", text: "Create a token with Workers AI permission on the Use REST API page, then paste it again.", code: msg.slice(0, 160) };
    if (status === 404 || /5007|not found/i.test(msg)) return { ok: false as const, title: "Clef wasn't found on this account", text: "Check the Account ID and that the model is clef or clef-flash.", code: msg.slice(0, 160) };
    return { ok: false as const, title: "Couldn't reach Clef", text: "Try again in a minute.", code: msg.slice(0, 160) };
  }
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const overlap = (a: string[], b: string[]) => a.find((x) => b.some((y) => norm(x) && norm(x) === norm(y)));

type Student = { headline?: string; skills?: string[]; education?: string[]; past_companies?: string[] };
type Ranked = { order: { i: number; why: string; link: Person["link"] }[] };

/**
 * Rank people with Clef: a usefulness score per person, plus a "real connection" choice.
 * Connections are double-checked in code (exact school / company / skill match) so Clef can't stretch.
 */
export async function clefRank(cfg: ClefConfig, job: { title: string; key_skills: string[]; company: string; size_band: string }, student: Student, people: Person[]): Promise<Ranked> {
  const state = {
    job,
    student,
    people: people.map((p, i) => ({ i, title: p.title, months_at_company: p.months, activity: p.active, schools: p.schools, past_companies: p.pastCompanies, headline: p.headline, skills: p.skills.slice(0, 15) })),
  };
  const questions: Record<string, Question> = {};
  people.forEach((_, i) => {
    questions[`fit_${i}`] = {
      type: "score",
      instructions: `How useful is the person with i=${i} in \`people\` for the student to message about \`job\`? Best: people on the hiring team or in the same role as the job, and people active on LinkedIn. At a small \`job.size_band\` company, founders and team leads are fine; at a big one, prefer peers and team leads over executives. Recruiters for this team are useful too.`,
      criteria: ["Not useful", "A little useful", "Useful", "Very useful"],
    };
    questions[`link_${i}`] = {
      type: "choice",
      instructions: `Is there a REAL, checkable connection between \`student\` and the person with i=${i} in \`people\`? Only an exact same school, the same past company, their headline saying they are hiring for this role, or them working on a key skill of \`job\` that the student also lists. Do not stretch.`,
      criteria: { none: "No real connection", school: "Same school or college", company: "Same past company", hiring: "Their headline says they are hiring for this role", skill: "Works on a key job skill the student also lists" },
    };
  });
  const a = await clefAsk(cfg, state, questions);

  const rows = people.map((p, i) => {
    const fit = a[`fit_${i}`]?.score ?? 0;
    const pick = a[`link_${i}`];
    const prob = pick?.choice ? pick.probabilities?.[pick.choice] ?? 0 : 0;
    let link: Person["link"] = null;
    if (pick?.choice && pick.choice !== "none" && prob >= 0.6) {
      if (pick.choice === "school") { const s = overlap(p.schools, student.education || []); if (s) link = { type: "school", detail: `You both went to ${s}` }; }
      else if (pick.choice === "company") { const c = overlap(p.pastCompanies, student.past_companies || []); if (c) link = { type: "company", detail: `You both worked at ${c}` }; }
      else if (pick.choice === "hiring") { if (/hiring|we're hiring|join (my|our) team/i.test(p.headline || "")) link = { type: "hiring", detail: "Their profile says they're hiring" }; }
      else if (pick.choice === "skill") { const k = overlap(p.skills, (student.skills || []).filter((x) => job.key_skills.some((y) => norm(y) === norm(x)))); if (k) link = { type: "skill", detail: `You both work with ${k}` }; }
    }
    const role = (p.title || "").split(/ at | @ /i)[0];
    const why = link ? `${link.detail}, so it's an easy start.` : p.active === "Active" ? `${role || "Works there"}, and active on LinkedIn.` : `${role || "Works there"}.`;
    return { i, fit: fit + (p.active === "Active" ? 0.05 : 0) + (link ? 0.3 : 0), why, link };
  });
  rows.sort((x, y) => y.fit - x.fit);
  await jlog("info", "rank", `Clef (${cfg.model}) ranked ${people.length} people: ${rows.map((r) => `${r.i}:${r.fit.toFixed(2)}${r.link ? `+${r.link.type}` : ""}`).join(", ")}`);
  return { order: rows.map(({ i, why, link }) => ({ i, why, link })) };
}
