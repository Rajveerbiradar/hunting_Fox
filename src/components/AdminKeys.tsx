"use client";
import { useEffect, useState } from "react";
import { Icon, Spinner, useToast } from "./ui";

type Tok = { label: string; last4: string | null; exhausted: boolean; remaining: number | null; start: number | null; rows: number; added: string | null; checked: string | null; source: "admin" | "env" };
type Prov = { id: string; name: string; base: string; model: string; last4: string | null; ok: boolean; error: string | null; source: "admin" | "env" };
type Data = { apify: Tok[]; pool: { left: number; start: number; accounts: number; working: number }; ai: Prov[]; writer: string; ranker: string; scanMode: string; error?: string };
type Test = { ok: boolean; title?: string; text?: string; code?: string; lines?: string[]; json?: string };
type Ed = { kind: "apify" | "ai"; target: string; name: string; base: string; key: string; model: string; preset: string };

const PRESETS: [string, string, string][] = [
  ["Anthropic", "https://api.anthropic.com/v1/", "claude-haiku-5-5"],
  ["OpenAI", "https://api.openai.com/v1", "gpt-5-mini"],
  ["OpenRouter", "https://openrouter.ai/api/v1", ""],
  ["Groq", "https://api.groq.com/openai/v1", ""],
  ["Cloudflare", "https://api.cloudflare.com/client/v4/accounts/ACCOUNT_ID/ai/v1", ""],
  ["Other", "", ""],
];
const money = (n: number | null | undefined) => `$${Number(n || 0).toFixed(2)}`;
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "");
const mono = { fontFamily: "ui-monospace, Menlo, monospace" };

/** Every key is tested before it can be saved. Keys are never shown again, only their last 4. */
export function AdminKeys() {
  const [data, setData] = useState<Data | null>(null);
  const [ed, setEd] = useState<Ed | null>(null);
  const [phase, setPhase] = useState<"idle" | "testing" | "pass" | "fail" | "saving">("idle");
  const [test, setTest] = useState<Test | null>(null);
  const [busy, setBusy] = useState("");
  const toast = useToast();

  const post = async (body: Record<string, unknown>) => {
    const r = await fetch("/api/admin/keys", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return r.json().catch(() => ({}));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetch("/api/admin/keys").then((r) => r.json()).then(setData).catch(() => toast.show("Couldn't load keys")); }, []);

  const open = (kind: "apify" | "ai", target: string, init: Partial<Ed> = {}) => { setEd({ kind, target, name: "", base: "", key: "", model: "", preset: "", ...init }); setPhase("idle"); setTest(null); };
  const upd = (p: Partial<Ed>) => { setEd((e) => (e ? { ...e, ...p } : e)); setPhase("idle"); setTest(null); };
  async function act(body: Record<string, unknown>, tag: string, msg?: string) {
    setBusy(tag);
    const d = await post(body);
    setBusy("");
    if (d.apify) setData(d);
    if (d.error) toast.show(d.error); else if (msg) toast.show(msg);
    return d;
  }
  async function runTest() {
    if (!ed) return;
    setPhase("testing");
    const t: Test = await post(ed.kind === "apify" ? { type: "apify_test", token: ed.key } : { type: "ai_test", base: ed.base, key: ed.key, model: ed.model }).catch(() => ({ ok: false, title: "Couldn't test the key" }));
    setTest(t); setPhase(t.ok ? "pass" : "fail");
  }
  async function save() {
    if (!ed) return;
    setPhase("saving");
    const d = ed.kind === "apify"
      ? await post({ type: "apify_save", label: ed.target === "new" ? ed.name : ed.target, token: ed.key })
      : await post({ type: "ai_save", id: ed.target === "new" ? undefined : ed.target, name: ed.name, base: ed.base, key: ed.key, model: ed.model });
    if (d.error) { setTest({ ok: false, title: d.error }); setPhase("fail"); return; }
    setData(d); setEd(null);
    toast.show(ed.kind === "apify" && test?.lines ? "Tested and saved. Its credit is added to your total" : "Tested and saved");
  }

  if (!data) return <div className="card row" style={{ marginTop: 16 }}><Spinner size={20} />Loading keys…</div>;
  const pct = data.pool.start ? Math.round((data.pool.left / data.pool.start) * 100) : 0;
  const isAi = ed?.kind === "ai";
  const ready = !!ed && !!ed.key.trim() && (!isAi || (!!ed.base.trim() && !!ed.model.trim())) && (ed.target !== "new" || !!ed.name.trim());

  const editor = (
    <div className="row" style={{ flexDirection: "column", alignItems: "stretch", gap: 14, background: "var(--sunken)", borderTop: "1px solid var(--line)" }}>
      {isAi && (
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Start from</div>
          <div role="radiogroup" aria-label="Provider" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {PRESETS.map(([l, b, m]) => <button key={l} className="opt" role="radio" aria-checked={ed?.preset === l} onClick={() => upd({ preset: l, base: b, model: m || ed?.model || "", name: l === "Other" ? ed?.name || "" : l === "Cloudflare" ? "Cloudflare Workers AI" : l })}>{l}</button>)}
          </div>
        </div>
      )}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {(ed?.target === "new" || isAi) && <div style={{ flex: "0 1 200px" }}><label htmlFor="kn" style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Name</label><input id="kn" className="in" style={{ width: "100%" }} placeholder={isAi ? "e.g. Anthropic" : "e.g. friend3"} value={ed?.name || ""} onChange={(e) => upd({ name: e.target.value })} /></div>}
        {isAi && <div style={{ flex: "1 1 300px", minWidth: 0 }}><label htmlFor="kb" style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Base URL</label><input id="kb" className="in" style={{ width: "100%", ...mono, fontSize: 14 }} placeholder="https://…/v1" value={ed?.base || ""} onChange={(e) => upd({ base: e.target.value, preset: "Other" })} /></div>}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 300px", minWidth: 0 }}><label htmlFor="kk" style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 6 }}>API key</label><input id="kk" className="in" type="password" autoComplete="off" style={{ width: "100%", ...mono }} placeholder={isAi ? "sk-…" : "apify_api_…"} value={ed?.key || ""} onChange={(e) => upd({ key: e.target.value })} /></div>
        {isAi && <div style={{ flex: "0 1 260px", minWidth: 0 }}><label htmlFor="km" style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Model</label><input id="km" className="in" style={{ width: "100%", ...mono, fontSize: 14 }} placeholder="model name" value={ed?.model || ""} onChange={(e) => upd({ model: e.target.value })} /></div>}
      </div>
      {phase === "testing" && <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 16, fontWeight: 600 }}><Spinner size={18} />{isAi ? "Sending a 10-token test request…" : "Checking the key with Apify…"}</div>}
      {phase === "pass" && test && (
        <div className="note" style={{ background: "var(--green-bg)", color: "var(--green)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 16, fontWeight: 700 }}>{Icon.check(20)}The key works</div>
          {test.lines?.map((l) => <div key={l} style={{ fontSize: 14, marginTop: 4 }}>✓ {l}</div>)}
          {test.json && <details style={{ marginTop: 6 }}><summary style={{ cursor: "pointer", fontSize: 14, fontWeight: 600, padding: "6px 0" }}>See the reply it sent back</summary><pre style={{ margin: "8px 0 0", padding: 14, background: "#fff", color: "var(--ink)", borderRadius: 14, ...mono, fontSize: 13, lineHeight: 1.5, overflowX: "auto" }}>{test.json}</pre></details>}
        </div>
      )}
      {phase === "fail" && test && (
        <div role="alert" className="note" style={{ background: "var(--red-bg)", color: "var(--red)" }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{test.title}</div>
          {test.text && <div style={{ fontSize: 14, lineHeight: 1.45, marginTop: 4 }}>{test.text}</div>}
          {test.code && <div style={{ fontSize: 13, marginTop: 6, ...mono, opacity: 0.85 }}>{test.code}</div>}
        </div>
      )}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {phase !== "pass" && phase !== "saving" && <button className="btn pri" disabled={!ready || phase === "testing"} onClick={runTest}>{phase === "fail" ? "Test again" : "Test key"}</button>}
        <button className={`btn ${phase === "pass" || phase === "saving" ? "pri" : "sec"}`} disabled={phase !== "pass"} onClick={save}>{phase === "saving" ? <Spinner size={16} color="#fff" /> : null}Save key</button>
        <button className="btn ghost" onClick={() => setEd(null)}>Cancel</button>
      </div>
      <div className="mute" style={{ fontSize: 14 }}>{phase === "pass" ? "Saving stores it encrypted. You won't see the full key again." : phase === "fail" ? "Fix it and test again. Save stays locked until a test passes." : "Test the key first. Save unlocks once it passes."}</div>
    </div>
  );

  return (
    <>
      <div className="card" style={{ marginTop: 24, padding: 24, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(220px,100%), 1fr))", gap: 20, alignItems: "center" }}>
        <div>
          <div className="lbl">Apify credit left, all accounts</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
            <span style={{ fontSize: 36, fontWeight: 700, letterSpacing: "-.02em", fontVariantNumeric: "tabular-nums" }}>{money(data.pool.left)}</span>
            <span className="mute" style={{ fontSize: 16 }}>of {money(data.pool.start)}</span>
          </div>
          <div className="mute" style={{ fontSize: 14 }}>{money(Math.max(0, data.pool.start - data.pool.left))} used · {data.pool.working} of {data.pool.accounts} accounts working · about {Math.floor(data.pool.left / 0.045)} more full scans</div>
        </div>
        <div>
          <div style={{ height: 10, borderRadius: 5, background: "var(--fill)", overflow: "hidden" }}><div style={{ height: "100%", width: `${pct}%`, background: "var(--ink)" }} /></div>
          <div className="mute" style={{ fontSize: 14, marginTop: 6, lineHeight: 1.45 }}>The total adds up every account. Each key&apos;s credit is read from Apify when you add it, then checked again every 10 minutes. Below $5 it switches to lean mode: 3 people per job and no emails.</div>
        </div>
        <div>
          <label htmlFor="mode" style={{ display: "block", fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Scan mode</label>
          <select id="mode" className="sel" style={{ width: "100%" }} value={data.scanMode} onChange={(e) => act({ type: "route", name: "scan_mode", value: e.target.value }, "mode", "Saved")}>
            <option value="auto">Automatic (recommended)</option><option value="full">Always full</option><option value="lean">Always lean</option>
          </select>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, margin: "32px 8px 0", flexWrap: "wrap" }}>
        <div><h2 className="h2">Apify accounts</h2><p className="mute" style={{ margin: "4px 0 0", fontSize: 14 }}>Used in this order. When one runs out or stops working, the next one takes over.</p></div>
        <button className="btn addb" onClick={() => open("apify", "new")}>{Icon.plus()}Add an account</button>
      </div>
      <div className="card" style={{ marginTop: 12, overflow: "hidden" }}>
        {!data.apify.length && !(ed?.kind === "apify" && ed.target === "new") && <div style={{ padding: "22px 20px" }}><b>No Apify accounts yet</b><div className="mute" style={{ fontSize: 16, marginTop: 4 }}>Scans can&apos;t run without one. Get a token from Apify → Settings → API &amp; Integrations.</div></div>}
        {data.apify.map((t, i) => (
          <div key={t.label} style={{ borderTop: i ? "1px solid var(--line)" : undefined }}>
            <div className="row">
              <span className="tile" style={{ width: 40, height: 40, background: t.exhausted ? "var(--red-bg)" : "var(--tile)", fontWeight: 700, fontSize: 14 }}>{i + 1}</span>
              <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>{t.label}</span>
                  <span className="tag" style={t.exhausted ? { background: "var(--red-bg)", color: "var(--red)", fontWeight: 700 } : { background: "var(--green-bg)", color: "var(--green)" }}>{t.exhausted ? "Out of credit or not working" : "Working"}</span>
                  {t.source === "env" && <span className="tag" style={{ background: "var(--tile)", color: "var(--mute)" }}>From Vercel settings</span>}
                </div>
                <div className="mute" style={{ fontSize: 14, marginTop: 2 }}>••••{t.last4 || "????"}{t.remaining != null ? ` · ${money(t.remaining)} left${t.start != null ? ` of ${money(t.start)} when added${t.added ? ` on ${day(t.added)}` : ""}` : ""}` : ""} · {t.rows} of 500 people rows this month</div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button className="btn sec sm" disabled={busy === `c-${t.label}`} onClick={() => act({ type: "apify_check", label: t.label }, `c-${t.label}`, `${t.label} checked`)}>{busy === `c-${t.label}` ? <Spinner size={14} /> : null}Test again</button>
                {t.exhausted && <button className="btn sec sm" onClick={() => act({ type: "apify_unpark", label: t.label }, "u")}>Use again</button>}
                {i > 0 && t.source === "admin" && <button className="btn sec sm" style={{ minWidth: 44, padding: 0 }} aria-label={`Move ${t.label} up`} onClick={() => act({ type: "apify_up", label: t.label }, "up")}>↑</button>}
                <button className="btn sec sm" onClick={() => open("apify", t.label)}>Replace</button>
                {t.source === "admin" && <button className="btn danger sm" onClick={() => act({ type: "apify_remove", label: t.label }, "r", `${t.label} removed`)}>Remove</button>}
              </div>
            </div>
            {ed?.kind === "apify" && ed.target === t.label && editor}
          </div>
        ))}
        {ed?.kind === "apify" && ed.target === "new" && editor}
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, margin: "40px 8px 0", flexWrap: "wrap" }}>
        <div><h2 className="h2">AI providers</h2><p className="mute" style={{ margin: "4px 0 0", fontSize: 14, maxWidth: "62ch" }}>Any provider that works with the OpenAI SDK: a base URL, an API key and a model name. Anthropic, OpenAI, OpenRouter, Groq and Cloudflare all do.</p></div>
        <button className="btn addb" onClick={() => open("ai", "new")}>{Icon.plus()}Add a provider</button>
      </div>
      <div className="card" style={{ marginTop: 12, overflow: "hidden" }}>
        {!data.ai.length && !(ed?.kind === "ai" && ed.target === "new") && <div style={{ padding: "22px 20px" }}><b>No AI provider yet</b><div className="mute" style={{ fontSize: 16, marginTop: 4 }}>Resume changes and messages need one.</div></div>}
        {data.ai.map((a, i) => (
          <div key={a.id} style={{ borderTop: i ? "1px solid var(--line)" : undefined }}>
            <div className="row">
              <span className="tile" style={{ width: 40, height: 40, background: "var(--tile)", fontWeight: 700, fontSize: 14 }}>{i + 1}</span>
              <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>{a.name}</span>
                  <span className="tag" style={a.ok ? { background: "var(--green-bg)", color: "var(--green)" } : { background: "var(--red-bg)", color: "var(--red)", fontWeight: 700 }}>{a.ok ? "Working" : "Not working"}</span>
                </div>
                <div className="mute" style={{ fontSize: 14, marginTop: 2, wordBreak: "break-all" }}><span style={{ ...mono, fontSize: 13 }}>{a.model}</span> · ••••{a.last4} · {a.base}{a.error ? ` · ${a.error}` : ""}</div>
              </div>
              {a.source === "admin" && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button className="btn sec sm" disabled={busy === `t-${a.id}`} onClick={async () => { const d = await act({ type: "ai_check", id: a.id }, `t-${a.id}`); if (d.test) toast.show(d.test.ok ? `${a.name}: ${d.test.lines?.[0] || "working"}` : `${a.name}: ${d.test.title}`); }}>{busy === `t-${a.id}` ? <Spinner size={14} /> : null}Test again</button>
                  <button className="btn sec sm" onClick={() => open("ai", a.id, { name: a.name, base: a.base, model: a.model })}>Edit</button>
                  <button className="btn danger sm" onClick={() => act({ type: "ai_remove", id: a.id }, "r", `${a.name} removed`)}>Remove</button>
                </div>
              )}
            </div>
            {ed?.kind === "ai" && ed.target === a.id && editor}
          </div>
        ))}
        {ed?.kind === "ai" && ed.target === "new" && editor}
      </div>

      {data.ai.length > 0 && (
        <>
          <h2 className="h2" style={{ margin: "40px 8px 0" }}>Which provider does what</h2>
          <p className="mute" style={{ margin: "4px 8px 0", fontSize: 14 }}>If the one you pick fails, the next working provider in the list above takes over. Changes take effect within 30 seconds.</p>
          <div className="card" style={{ marginTop: 12 }}>
            {([["writer_provider", "Writing resume changes and messages", "Needs a good writer. Haiku or GPT-5 mini are cheap and good enough.", data.writer], ["ranker_provider", "Ranking people", "Small and fast is fine. A free Cloudflare model works.", data.ranker]] as const).map(([name, title, sub, val]) => (
              <div className="row" key={name}>
                <label htmlFor={name} style={{ flex: "1 1 220px", minWidth: 0 }}><span style={{ display: "block", fontSize: 16, fontWeight: 700 }}>{title}</span><span className="mute" style={{ display: "block", fontSize: 14, marginTop: 2 }}>{sub}</span></label>
                <select id={name} className="sel" value={val || data.ai[0].id} onChange={(e) => act({ type: "route", name, value: e.target.value }, name, "Saved")}>
                  {data.ai.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.model}</option>)}
                </select>
              </div>
            ))}
          </div>
        </>
      )}
      <p className="mute" style={{ margin: "16px 8px 0", fontSize: 14 }}>How the test works: Apify keys are checked with one free request to the account. AI keys get one tiny chat request (about 10 tokens), and it has to reply in the OpenAI chat format before Save unlocks. Change any field and you&apos;ll need to test again.</p>
      {toast.el}
    </>
  );
}
