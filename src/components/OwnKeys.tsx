"use client";
import { useEffect, useState } from "react";
import { Icon, Spinner, useToast } from "./ui";

type Row = { last4: string | null; base_url?: string | null; model?: string | null; provider?: string | null; remaining_usd?: number | null; fallback?: "free" | "stop"; ok?: boolean } | null;
type Test = { ok: boolean; title?: string; text?: string; lines?: string[] };

const PRESETS: [string, string, string][] = [
  ["OpenAI", "https://api.openai.com/v1", "gpt-5-mini"],
  ["Groq", "https://api.groq.com/openai/v1", ""],
  ["OpenRouter", "https://openrouter.ai/api/v1", ""],
  ["Anthropic", "https://api.anthropic.com/v1/", "claude-haiku-5-5"],
  ["Other", "", ""],
];

/** Account → Use your own keys. Test first; Save unlocks only when the test passes. */
export function OwnKeys() {
  const [data, setData] = useState<{ apify: Row; ai: Row } | null>(null);
  const [kind, setKind] = useState<"apify" | "ai" | null>(null);
  const [key, setKey] = useState(""), [base, setBase] = useState(""), [model, setModel] = useState(""), [preset, setPreset] = useState("");
  const [phase, setPhase] = useState<"idle" | "testing" | "pass" | "fail" | "saving">("idle");
  const [test, setTest] = useState<Test | null>(null);
  const toast = useToast();

  useEffect(() => { fetch("/api/account/keys").then((r) => r.json()).then(setData).catch(() => setData({ apify: null, ai: null })); }, []);

  const open = (k: "apify" | "ai") => { setKind(k); setKey(""); setBase(k === "ai" ? data?.ai?.base_url || "" : ""); setModel(k === "ai" ? data?.ai?.model || "" : ""); setPreset(""); setPhase("idle"); setTest(null); };
  const changed = (f: () => void) => { f(); setPhase("idle"); setTest(null); };
  const post = (body: object) => fetch("/api/account/keys", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
  const ready = !!key.trim() && (kind !== "ai" || (!!base.trim() && !!model.trim()));

  async function runTest() {
    setPhase("testing");
    const t: Test = await post(kind === "apify" ? { type: "apify_test", key } : { type: "ai_test", key, base, model }).catch(() => ({ ok: false, title: "Couldn't test the key", text: "Check your connection and try again." }));
    setTest(t); setPhase(t.ok ? "pass" : "fail");
  }
  async function save() {
    setPhase("saving");
    const d = await post(kind === "apify" ? { type: "apify_save", key } : { type: "ai_save", key, base, model, provider: preset && preset !== "Other" ? preset : "Your AI" });
    if (d.ok === false) { setTest(d); setPhase("fail"); return; }
    setData({ apify: d.apify, ai: d.ai }); setKind(null); toast.show("Tested and saved");
  }
  async function remove(k: "apify" | "ai") { const d = await post({ type: "remove", kind: k }); setData({ apify: d.apify, ai: d.ai }); toast.show("Key removed"); }

  if (!data) return <div className="card row" style={{ marginTop: 12 }}><Spinner size={20} />Loading your keys…</div>;

  const rows = [
    { k: "apify" as const, mark: "A", title: "Apify key", row: data.apify, meta: data.apify ? `••••${data.apify.last4} · ${data.apify.remaining_usd != null ? `$${Number(data.apify.remaining_usd).toFixed(2)} left this month · ` : ""}your searches don't count toward your free ones` : "Finds the job and the people who work there. This is the part that costs money." },
    { k: "ai" as const, mark: "AI", title: "AI key", row: data.ai, meta: data.ai ? `${data.ai.provider} · ${data.ai.model} · ••••${data.ai.last4}` : "Writes your resume changes and messages. Any key that works with the OpenAI SDK." },
  ];

  return (
    <>
      <div className="card" style={{ marginTop: 12, overflow: "hidden" }}>
        {rows.map((r, i) => (
          <div key={r.k} style={{ borderTop: i ? "1px solid var(--line)" : undefined }}>
            <div className="row">
              <span className="tile" style={{ width: 44, height: 44, background: "var(--tile)", color: "var(--tile-ink)", fontWeight: 700, fontSize: 15 }}>{r.mark}</span>
              <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>{r.title}</span>
                  <span className="tag" style={r.row ? (r.row.ok === false ? { background: "var(--red-bg)", color: "var(--red)" } : { background: "var(--green-bg)", color: "var(--green)" }) : { background: "var(--tile)", color: "var(--mute)" }}>{r.row ? (r.row.ok === false ? "Out of credit" : "Working") : "Not added"}</span>
                </div>
                <div className="mute" style={{ fontSize: 14, marginTop: 2, lineHeight: 1.4 }}>{r.meta}</div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button className="btn sec" onClick={() => open(r.k)}>{r.row ? "Replace" : "Add key"}</button>
                {r.row && <button className="btn danger" onClick={() => remove(r.k)}>Remove</button>}
              </div>
            </div>
            {kind === r.k && (
              <div className="row" style={{ flexDirection: "column", alignItems: "stretch", gap: 14, background: "var(--sunken)" }}>
                <div className="mute" style={{ fontSize: 14, lineHeight: 1.5 }}>
                  {r.k === "apify" ? "It's free: Apify gives every account $5 of credit each month, about 110 searches. Sign up at apify.com, then go to Settings → API & Integrations and copy your token." : "Groq and OpenRouter have free models. Paste the base URL, key and model name from your provider, or tap one below to fill in the address."}
                </div>
                {r.k === "ai" && (
                  <>
                    <div role="radiogroup" aria-label="Where is your key from?" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {PRESETS.map(([l, b, m]) => <button key={l} className="opt" role="radio" aria-checked={preset === l} onClick={() => changed(() => { setPreset(l); setBase(b); if (m) setModel(m); })}>{l}</button>)}
                    </div>
                    <div><label htmlFor="ob" style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Base URL</label><input id="ob" className="in" style={{ width: "100%", fontFamily: "ui-monospace, Menlo, monospace", fontSize: 14 }} placeholder="https://…/v1" value={base} onChange={(e) => changed(() => { setBase(e.target.value); setPreset("Other"); })} /></div>
                  </>
                )}
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ flex: "1 1 280px", minWidth: 0 }}><label htmlFor="ok" style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{r.k === "apify" ? "Apify API token" : "API key"}</label><input id="ok" className="in" type="password" autoComplete="off" style={{ width: "100%", fontFamily: "ui-monospace, Menlo, monospace" }} placeholder={r.k === "apify" ? "apify_api_…" : "sk-…"} value={key} onChange={(e) => changed(() => setKey(e.target.value))} /></div>
                  {r.k === "ai" && <div style={{ flex: "0 1 240px", minWidth: 0 }}><label htmlFor="om" style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Model</label><input id="om" className="in" style={{ width: "100%", fontFamily: "ui-monospace, Menlo, monospace", fontSize: 14 }} placeholder="model name" value={model} onChange={(e) => changed(() => setModel(e.target.value))} /></div>}
                </div>
                {phase === "testing" && <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 16, fontWeight: 600 }}><Spinner size={18} />{r.k === "ai" ? "Sending a tiny test message…" : "Checking your key with Apify…"}</div>}
                {phase === "pass" && test && <div className="note" style={{ background: "var(--green-bg)", color: "var(--green)" }}><div style={{ fontSize: 16, fontWeight: 700 }}>Your key works</div>{test.lines?.map((l) => <div key={l} style={{ fontSize: 14, marginTop: 4 }}>✓ {l}</div>)}</div>}
                {phase === "fail" && test && <div role="alert" className="note" style={{ background: "var(--red-bg)", color: "var(--red)" }}><div style={{ fontSize: 16, fontWeight: 700 }}>{test.title}</div><div style={{ fontSize: 14, lineHeight: 1.45, marginTop: 4 }}>{test.text}</div></div>}
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {phase !== "pass" && phase !== "saving" && <button className="btn pri" disabled={!ready || phase === "testing"} onClick={runTest}>{phase === "fail" ? "Test again" : "Test key"}</button>}
                  <button className={`btn ${phase === "pass" || phase === "saving" ? "pri" : "sec"}`} disabled={phase !== "pass"} onClick={save}>{phase === "saving" ? <Spinner size={16} color="#fff" /> : null}Save key</button>
                  <button className="btn ghost" onClick={() => setKind(null)}>Cancel</button>
                </div>
                <div className="mute" style={{ fontSize: 14 }}>{phase === "pass" ? "Saving stores it encrypted. You won't see the full key again." : phase === "fail" ? "Fix it and test again. Save stays locked until the test passes." : "Test your key first. Save unlocks once it works."}</div>
              </div>
            )}
          </div>
        ))}
        {data.apify && (
          <div className="row">
            <label htmlFor="fb" style={{ flex: "1 1 220px", minWidth: 0 }}><span style={{ display: "block", fontSize: 16, fontWeight: 700 }}>If your key runs out of credit</span><span className="mute" style={{ display: "block", fontSize: 14, marginTop: 2 }}>We&apos;ll tell you either way.</span></label>
            <select id="fb" className="sel" defaultValue={data.apify.fallback || "free"} onChange={async (e) => { await post({ type: "fallback", value: e.target.value }); toast.show("Saved"); }}>
              <option value="free">Use my free searches instead</option>
              <option value="stop">Stop and tell me</option>
            </select>
          </div>
        )}
      </div>
      <div className="mute" style={{ margin: "12px 8px 0", display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, lineHeight: 1.5 }}>
        <span style={{ flex: "none", marginTop: 1 }}>{Icon.shield(18)}</span>
        <span>We test every key before saving it. It&apos;s stored encrypted, used only for your own searches, and never shown again, only its last 4 characters. You can remove it any time. Your keys don&apos;t skip approval: Hunting Fox is still only for finding jobs, not for collecting people&apos;s details.</span>
      </div>
      {toast.el}
    </>
  );
}
