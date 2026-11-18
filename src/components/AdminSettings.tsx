"use client";
import { useEffect, useState } from "react";
import { Spinner, useToast } from "./ui";

type S = {
  defaultSearches: number; autoApprove: boolean; allowAskMore: boolean; emailsOn: boolean; retention30: boolean; paused: boolean;
  admins: { email: string; fromEnv: boolean; you: boolean }[]; contact: { email: string; whatsappDisplay: string }; emailReady: boolean; error?: string; deleted?: number;
};

function Switch({ on, label, onChange }: { on: boolean; label: string; onChange: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onChange}
      style={{ width: 52, height: 32, flex: "none", borderRadius: 16, border: on ? 0 : "2px solid var(--line-strong)", background: on ? "var(--ink)" : "var(--fill)", position: "relative", cursor: "pointer", padding: 0 }}>
      <span style={{ position: "absolute", top: on ? 3 : 1, left: on ? 23 : 1, width: 26, height: 26, borderRadius: 13, background: "#fff", boxShadow: "0 1px 3px rgba(16,24,40,.25)", transition: "left .15s" }} />
    </button>
  );
}

// Defined outside the page so inputs inside it keep focus while typing.
function Row({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return <div className="row"><div style={{ flex: "1 1 240px", minWidth: 0 }}><div style={{ fontSize: 16, fontWeight: 700 }}>{title}</div><div className="mute" style={{ fontSize: 14, marginTop: 2, lineHeight: 1.4 }}>{sub}</div></div>{children}</div>;
}

/** How Hunting Fox runs while you test it. */
export function AdminSettings() {
  const [s, setS] = useState<S | null>(null);
  const [newAdmin, setNewAdmin] = useState("");
  const [searches, setSearches] = useState("");
  const [wipeOpen, setWipeOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const toast = useToast();

  const post = async (body: object, msg?: string) => {
    const r = await fetch("/api/admin/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.error) return toast.show(d.error || "Couldn't save. Try again.");
    setS(d);
    if (msg) toast.show(msg);
    return d as S;
  };
  useEffect(() => { fetch("/api/admin/settings", { cache: "no-store" }).then((r) => r.json()).then((d) => { setS(d); setSearches(String(d.defaultSearches)); }); }, []);
  if (!s) return <div className="card row" style={{ marginTop: 16 }}><Spinner size={20} />Loading settings…</div>;

  const sw = (name: keyof S, on: string, off: string) => () => post({ type: "switch", name, value: !s[name] }, !s[name] ? on : off);

  return (
    <>
      <h2 className="h2" style={{ margin: "32px 8px 0" }}>Students</h2>
      <div className="card" style={{ marginTop: 12 }}>
        <Row title="Searches for a new student" sub="Filled into the box when you approve someone">
          <div style={{ display: "flex", gap: 8 }}>
            <input className="in" inputMode="numeric" aria-label="Searches for a new student" style={{ width: 80, flex: "none" }} value={searches} onChange={(e) => setSearches(e.target.value.replace(/\D/g, ""))} />
            <button className="btn sec" disabled={!searches || Number(searches) === s.defaultSearches} onClick={() => post({ type: "default_searches", value: Number(searches) }, "Saved")}>Save</button>
          </div>
        </Row>
        <Row title="Approve everyone automatically" sub="Skip the waiting list. Use this only if you trust where the link is shared."><Switch on={s.autoApprove} label="Approve everyone automatically" onChange={sw("autoApprove", "New students are approved automatically", "Back to approving by hand")} /></Row>
        <Row title="Let students ask for more searches" sub={'Shows "Ask for more searches" when someone runs out'}><Switch on={s.allowAskMore} label="Let students ask for more searches" onChange={sw("allowAskMore", "Students can ask for more", "Asking for more is off")} /></Row>
      </div>

      <h2 className="h2" style={{ margin: "40px 8px 0" }}>Contact shown to students</h2>
      <p className="mute" style={{ margin: "4px 8px 0", fontSize: 14 }}>On the waiting screen, in every answer and when someone has good news. To change it, edit src/lib/contact.ts.</p>
      <div className="card" style={{ marginTop: 12 }}>
        <div className="row"><span style={{ flex: 1, fontSize: 16 }}>WhatsApp</span><b>{s.contact.whatsappDisplay}</b></div>
        <div className="row"><span style={{ flex: 1, fontSize: 16 }}>Email</span><b style={{ wordBreak: "break-all" }}>{s.contact.email}</b></div>
      </div>

      <h2 className="h2" style={{ margin: "40px 8px 0" }}>Admins</h2>
      <p className="mute" style={{ margin: "4px 8px 0", fontSize: 14 }}>They can open this page, approve students and change keys.</p>
      <div className="card" style={{ marginTop: 12 }}>
        {s.admins.map((a) => (
          <div key={a.email} className="row">
            <span className="av" aria-hidden>{a.email[0].toUpperCase()}</span>
            <span style={{ flex: "1 1 200px", minWidth: 0, fontSize: 16, wordBreak: "break-all" }}>{a.email}</span>
            {a.you && <span className="tag" style={{ background: "var(--tile)", color: "var(--mute)" }}>You</span>}
            {a.fromEnv ? <span className="mute" style={{ fontSize: 14 }}>From Vercel settings</span> : !a.you && <button className="btn danger sm" onClick={() => post({ type: "remove_admin", email: a.email }, "Admin removed")}>Remove</button>}
          </div>
        ))}
        <div className="row">
          <input className="in" type="email" aria-label="New admin email" placeholder="New admin email" value={newAdmin} onChange={(e) => setNewAdmin(e.target.value)} />
          <button className="btn sec" disabled={!/@/.test(newAdmin)} onClick={async () => { if (await post({ type: "add_admin", email: newAdmin }, "Admin added")) setNewAdmin(""); }}>Add admin</button>
        </div>
      </div>

      <h2 className="h2" style={{ margin: "40px 8px 0" }}>Emails and data</h2>
      <div className="card" style={{ marginTop: 12 }}>
        <Row title="Send emails" sub={s.emailReady ? '"Your job is ready", approvals and answers to requests.' : "Needs RESEND_API_KEY and EMAIL_FROM in Vercel. Until then nothing is sent."}><Switch on={s.emailsOn} label="Send emails" onChange={sw("emailsOn", "Emails on", "Emails off")} /></Row>
        <Row title="Delete student data after 30 days" sub="Jobs, plans and people lists older than 30 days are deleted every night"><Switch on={s.retention30} label="Delete student data after 30 days" onChange={sw("retention30", "Data deletes after 30 days", "Data is kept")} /></Row>
      </div>

      <h2 className="h2" style={{ margin: "40px 8px 0" }}>Danger zone</h2>
      <div className="card" style={{ marginTop: 12 }}>
        <Row title="Pause new searches" sub="Students can still open saved jobs. Use it if credit runs out or something breaks."><Switch on={s.paused} label="Pause new searches" onChange={sw("paused", "New searches paused", "Searches running again")} /></Row>
        <Row title="Delete all test data" sub="Every student who isn't an admin, with their resumes, jobs, keys and requests. Can't be undone.">
          {!wipeOpen && <button className="btn danger" onClick={() => setWipeOpen(true)}>Delete everything</button>}
        </Row>
        {wipeOpen && (
          <div className="row" style={{ flexDirection: "column", alignItems: "stretch", gap: 10, background: "var(--red-bg)" }}>
            <label htmlFor="wipe" style={{ fontSize: 16, fontWeight: 700, color: "var(--red)" }}>Type DELETE to confirm</label>
            <input id="wipe" className="in" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn" style={{ background: "var(--red)", color: "#fff" }} disabled={confirm !== "DELETE"} onClick={async () => { const d = await post({ type: "wipe", confirm }); if (d) { toast.show(`Deleted ${d.deleted ?? 0} students and their data`); setWipeOpen(false); setConfirm(""); } }}>Delete everything</button>
              <button className="btn sec" style={{ background: "#fff" }} onClick={() => { setWipeOpen(false); setConfirm(""); }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
      {toast.el}
    </>
  );
}
