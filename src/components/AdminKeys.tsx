"use client";
import { useEffect, useState } from "react";
import { Icon, Spinner } from "./ui";

type Tok = { label: string; last4: string | null; exhausted: boolean; remaining: number | null; rows: number; checked: string | null; source: "admin" | "env" };
type Setting = { set: boolean; source: "admin" | "env" | "none"; show: string };
type Data = { apify: Tok[]; settings: Record<string, Setting>; error?: string };

const MODELS = [
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5 · cheap, fast (recommended)" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 · better writing, costs more" },
];

function SourceTag({ s }: { s: "admin" | "env" | "none" }) {
  const map = { admin: ["Set here", "#E8F5EC", "#155C35"], env: ["From Vercel settings", "#F2F2F2", "#5E5E63"], none: ["Not set", "#FDECEC", "#B42318"] } as const;
  const [t, bg, fg] = map[s];
  return <span className="tag" style={{ background: bg, color: fg }}>{t}</span>;
}

/** Paste, replace and remove keys without touching Vercel. Keys are never shown again after saving. */
export function AdminKeys() {
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState<string | null>(null); // apify label being replaced, "new", or a setting name
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");

  useEffect(() => { fetch("/api/admin/keys").then((r) => r.json()).then(setData).catch(() => setErr("Couldn't load keys.")); }, []);

  async function act(body: Record<string, unknown>, tag: string) {
    setBusy(tag); setErr("");
    const r = await fetch("/api/admin/keys", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    setBusy("");
    if (!r.ok) return setErr(d.error || "Couldn't save. Try again.");
    if (d.error) setErr(d.error);
    setData(d);
    setEditing(null); setValue(""); setLabel("");
  }
  const open = (k: string, l = "") => { setEditing(k); setLabel(l); setValue(""); setErr(""); };

  if (!data) return <div className="card row" style={{ marginTop: 16 }}><Spinner size={20} />Loading keys…</div>;
  const pooled = data.apify.reduce((a, t) => a + (t.exhausted ? 0 : Number(t.remaining || 0)), 0);
  const s = data.settings;

  const pasteForm = ({ onSave, withLabel, placeholder, tag, plain }: { onSave: () => void; withLabel?: boolean; placeholder: string; tag: string; plain?: boolean }) => (
    <div className="row" style={{ flexDirection: "column", alignItems: "stretch", background: "#FAFAFA", borderTop: "1px solid var(--line)" }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {withLabel && (
          <div style={{ flex: "0 1 180px" }}>
            <label htmlFor="kl" style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Name</label>
            <input id="kl" className="in" style={{ width: "100%" }} placeholder="e.g. friend2" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
        )}
        <div style={{ flex: "1 1 260px", minWidth: 0 }}>
          <label htmlFor="kv" style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Paste the key</label>
          <input id="kv" className="in" style={{ width: "100%", fontFamily: "ui-monospace, Menlo, monospace" }} type={plain ? "text" : "password"} autoComplete="off" placeholder={placeholder} value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button className="btn dark" disabled={!value.trim() || (withLabel && !label.trim()) || busy === tag} onClick={onSave}>{busy === tag ? <Spinner size={16} color="#fff" /> : null}Check and save</button>
        <button className="btn ghost" onClick={() => setEditing(null)}>Cancel</button>
      </div>
      <div className="mute" style={{ fontSize: 13 }}>We check the key works before saving it. After that it&apos;s stored encrypted and never shown again, only its last 4 characters.</div>
    </div>
  );

  return (
    <>
      {err && <div className="card" style={{ marginTop: 16, padding: "14px 18px", background: "#FDECEC", color: "#8A1414", fontWeight: 600 }}>{err}</div>}

      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, margin: "28px 8px 0", flexWrap: "wrap" }}>
        <div>
          <h2 className="h2">Apify accounts</h2>
          <p className="mute" style={{ margin: "4px 0 0", fontSize: 14 }}>Used in this order. When one runs out or stops working, the next one takes over. About ${pooled.toFixed(2)} left in total.</p>
        </div>
        <button className="btn addb" onClick={() => open("new")}>{Icon.plus()}Add an account</button>
      </div>
      <div className="card" style={{ marginTop: 12 }}>
        {!data.apify.length && editing !== "new" && <div style={{ padding: "22px 20px" }}><b>No Apify accounts yet</b><div className="mute" style={{ fontSize: 15, marginTop: 4 }}>Scans can&apos;t run without one. Add your token from Apify → Settings → API &amp; Integrations.</div></div>}
        {data.apify.map((t, i) => {
          const state = t.exhausted ? ["Out of credit or not working", "#FDECEC", "#B42318"] : t.remaining == null ? ["Not checked yet", "#F2F2F2", "#5E5E63"] : ["Working", "#E8F5EC", "#155C35"];
          return (
            <div key={t.label}>
              <div className="row" style={{ borderTop: i ? "1px solid var(--line)" : undefined }}>
                <span className="tile" style={{ width: 40, height: 40, background: "var(--bg)", fontWeight: 800, fontSize: 14 }}>{i + 1}</span>
                <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 16, fontWeight: 700 }}>{t.label}</span>
                    <span className="tag" style={{ background: state[1], color: state[2] }}>{state[0]}</span>
                    {t.source === "env" && <SourceTag s="env" />}
                  </div>
                  <div className="mute" style={{ fontSize: 14, marginTop: 2 }}>
                    ••••{t.last4 || "????"}{t.remaining != null ? ` · $${Number(t.remaining).toFixed(2)} left` : ""} · {t.rows} of 500 people rows this month
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button className="btn sec" disabled={busy === `c-${t.label}`} onClick={() => act({ type: "apify_check", label: t.label }, `c-${t.label}`)}>{busy === `c-${t.label}` ? <Spinner size={16} /> : null}Check</button>
                  {t.exhausted && <button className="btn sec" onClick={() => act({ type: "apify_unpark", label: t.label }, `u-${t.label}`)}>Use again</button>}
                  <button className="btn sec" onClick={() => open(`apify:${t.label}`, t.label)}>Replace</button>
                  {t.source === "admin" && <button className="btn ghost" style={{ color: "var(--red)" }} onClick={() => act({ type: "apify_remove", label: t.label }, `r-${t.label}`)}>Remove</button>}
                </div>
              </div>
              {editing === `apify:${t.label}` && pasteForm({ tag: "apify", placeholder: "apify_api_…", onSave: () => act({ type: "apify_save", label: t.label, token: value }, "apify") })}
            </div>
          );
        })}
        {editing === "new" && pasteForm({ withLabel: true, tag: "apify", placeholder: "apify_api_…", onSave: () => act({ type: "apify_save", label, token: value }, "apify") })}
      </div>

      <h2 className="h2" style={{ margin: "40px 8px 0" }}>AI</h2>
      <p className="mute" style={{ margin: "4px 8px 0", fontSize: 14 }}>Changes take effect within 30 seconds. No redeploy needed.</p>
      <div className="card" style={{ marginTop: 12 }}>
        <div className="row">
          <div style={{ flex: "1 1 200px", minWidth: 0 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><span style={{ fontSize: 16, fontWeight: 700 }}>Anthropic key</span><SourceTag s={s.anthropic_key.source} /></div>
            <div className="mute" style={{ fontSize: 14, marginTop: 2 }}>{s.anthropic_key.show || "Needed for reading resumes and writing messages"}</div>
          </div>
          <button className="btn sec" onClick={() => open("anthropic_key")}>{s.anthropic_key.set ? "Replace" : "Add key"}</button>
        </div>
        {editing === "anthropic_key" && pasteForm({ tag: "anthropic", placeholder: "sk-ant-…", onSave: () => act({ type: "setting", name: "anthropic_key", value }, "anthropic") })}
        <div className="row">
          <label htmlFor="wm" style={{ flex: "1 1 200px", fontSize: 16, fontWeight: 700 }}>Writing model</label>
          <select id="wm" className="sel" value={s.writer_model.show || "claude-haiku-5-5"} onChange={(e) => act({ type: "setting", name: "writer_model", value: e.target.value }, "model")}>
            {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>
      </div>

      <h2 className="h2" style={{ margin: "40px 8px 0" }}>Cloudflare Clef (optional)</h2>
      <p className="mute" style={{ margin: "4px 8px 0", fontSize: 14 }}>Ranks people for free. If any of these is empty, the writing model ranks them instead.</p>
      <div className="card" style={{ marginTop: 12 }}>
        {([["cf_account_id", "Account ID", "e.g. 1a2b3c…", false], ["cf_api_token", "API token", "Cloudflare token with Workers AI access", true], ["cf_decision_model", "Model name", "copy it from Workers AI → Models", false]] as const).map(([name, title, ph, secret]) => (
          <div key={name}>
            <div className="row">
              <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><span style={{ fontSize: 16, fontWeight: 700 }}>{title}</span><SourceTag s={s[name].source} /></div>
                <div className="mute" style={{ fontSize: 14, marginTop: 2, wordBreak: "break-all" }}>{s[name].show || "Empty"}</div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn sec" onClick={() => open(name)}>{s[name].set ? "Replace" : "Add"}</button>
                {s[name].source === "admin" && <button className="btn ghost" style={{ color: "var(--red)" }} onClick={() => act({ type: "setting", name, value: "" }, `x-${name}`)}>Clear</button>}
              </div>
            </div>
            {editing === name && pasteForm({ tag: name, placeholder: ph, plain: !secret, onSave: () => act({ type: "setting", name, value }, name) })}
          </div>
        ))}
      </div>
    </>
  );
}
