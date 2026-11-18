"use client";
import { useEffect, useState } from "react";
import { Spinner, letterTile, useToast } from "./ui";

type Req = {
  id: string; user_id: string; name: string; email: string | null; note: string | null; status: "waiting" | "approved" | "declined";
  granted: number | null; waitlist: boolean; created_at: string; used: number; limit: number; applied: number; replies: number;
  templates: { used: string; credit: string };
};

function ago(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.floor(m / 60)} h ago` : `${Math.floor(m / 1440)} days ago`;
}

/** "Ask for more searches": give more, or say no with a message (in the app and by email). */
export function AdminRequests({ onCount }: { onCount?: (n: number) => void }) {
  const [rows, setRows] = useState<Req[] | null>(null);
  const [tab, setTab] = useState<"waiting" | "done">("waiting");
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [noFor, setNoFor] = useState<string | null>(null);
  const [tpl, setTpl] = useState<"used" | "credit">("credit");
  const [msg, setMsg] = useState("");
  const [waitlist, setWaitlist] = useState(true);
  const [busy, setBusy] = useState("");
  const toast = useToast();

  const load = () => fetch("/api/admin/requests", { cache: "no-store" }).then((r) => r.json()).then((d) => { setRows(d.requests || []); onCount?.((d.requests || []).filter((r: Req) => r.status === "waiting").length); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  async function act(r: Req, body: Record<string, unknown>, done: string) {
    setBusy(r.id);
    const res = await fetch("/api/admin/requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: r.id, ...body }) });
    setBusy("");
    if (!res.ok) return toast.show("Couldn't save. Try again.");
    setNoFor(null); toast.show(done); load();
  }

  if (!rows) return <div className="card row" style={{ marginTop: 16 }}><Spinner size={20} />Loading requests…</div>;
  const list = rows.filter((r) => (tab === "waiting" ? r.status === "waiting" : r.status !== "waiting"));

  return (
    <>
      <div className="seg" role="tablist" style={{ marginTop: 24 }}>
        <button role="tab" aria-selected={tab === "waiting"} onClick={() => setTab("waiting")}>Waiting · {rows.filter((r) => r.status === "waiting").length}</button>
        <button role="tab" aria-selected={tab === "done"} onClick={() => setTab("done")}>Answered</button>
      </div>
      <div className="card" style={{ marginTop: 16, overflow: "hidden" }}>
        {!list.length && <div style={{ padding: "24px 20px" }} className="mute">{tab === "waiting" ? "No one is asking right now." : "Nothing here yet."}</div>}
        {list.map((r, i) => {
          const t = letterTile(r.name);
          const first = r.name.split(" ")[0];
          return (
            <div key={r.id} style={{ borderTop: i ? "1px solid var(--line)" : undefined }}>
              <div className="row" style={{ alignItems: "flex-start" }}>
                <span className="tile" style={{ width: 48, height: 48, background: t.bg, color: t.fg, fontWeight: 700 }}>{t.letters}</span>
                <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 18, fontWeight: 700 }}>{r.name}</span>
                    <span className="tag" style={r.status === "waiting" ? { background: "var(--tile)", color: "var(--mute)" } : r.status === "approved" ? { background: "var(--green-bg)", color: "var(--green)" } : { background: "var(--tile)", color: "var(--mute)" }}>
                      {r.status === "waiting" ? "◷ Waiting" : r.status === "approved" ? `✓ Given ${r.granted}` : r.waitlist ? "On the waiting list" : "Said no"}
                    </span>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 600, marginTop: 6 }}>Used {r.used} of {r.limit} · {r.applied} applied · {r.replies} {r.replies === 1 ? "reply" : "replies"}</div>
                  <div className="mute" style={{ fontSize: 14, marginTop: 2 }}>{r.email} · asked {ago(r.created_at)}</div>
                  {r.note && <div className="note" style={{ marginTop: 10, fontSize: 16 }}>“{r.note}”</div>}
                </div>
                {r.status === "waiting" && noFor !== r.id && (
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <button className="btn sec" disabled={busy === r.id} onClick={() => act(r, { action: "give", n: 10 }, `${first} got 10 more searches. They'll see it in the app and by email.`)}>+10</button>
                    <button className="btn sec" disabled={busy === r.id} onClick={() => act(r, { action: "give", n: 25 }, `${first} got 25 more searches. They'll see it in the app and by email.`)}>+25</button>
                    <input className="in" inputMode="numeric" aria-label={`Custom number of searches for ${first}`} placeholder="#" style={{ width: 64, flex: "none" }} value={custom[r.id] || ""} onChange={(e) => setCustom({ ...custom, [r.id]: e.target.value.replace(/\D/g, "") })} />
                    <button className="btn sec" disabled={!custom[r.id] || busy === r.id} onClick={() => act(r, { action: "give", n: Number(custom[r.id]) }, `${first} got ${custom[r.id]} more searches.`)}>Give</button>
                    <button className="btn ghost" onClick={() => { const k = r.used >= 20 ? "used" : "credit"; setNoFor(r.id); setTpl(k); setMsg(r.templates[k]); setWaitlist(true); }}>Say no</button>
                  </div>
                )}
              </div>
              {noFor === r.id && (
                <div className="row" style={{ flexDirection: "column", alignItems: "stretch", gap: 12, background: "var(--sunken)" }}>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>Say no to {first}</div>
                  <div role="radiogroup" aria-label="Message" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {([["used", "Already used a lot"], ["credit", "Credit is running out"]] as const).map(([k, l]) => (
                      <button key={k} className="opt" role="radio" aria-checked={tpl === k} onClick={() => { setTpl(k); setMsg(r.templates[k]); }}>{l}</button>
                    ))}
                  </div>
                  <label htmlFor="nomsg" style={{ fontSize: 14, fontWeight: 600 }}>Message (you can edit it)</label>
                  <textarea id="nomsg" className="ta" rows={9} value={msg} onChange={(e) => setMsg(e.target.value)} />
                  <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 16 }}><input type="checkbox" checked={waitlist} onChange={() => setWaitlist(!waitlist)} style={{ width: 20, height: 20, accentColor: "#101828" }} />Add {first} to the waiting list for more searches</label>
                  <div className="mute" style={{ fontSize: 14 }}>{first} sees this in Hunting Fox and by email, with your WhatsApp and email under it.</div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button className="btn pri" disabled={busy === r.id} onClick={() => act(r, { action: "decline", message: msg, waitlist }, `Sent to ${first}${waitlist ? " and added to the waiting list" : ""}`)}>Send</button>
                    <button className="btn ghost" onClick={() => setNoFor(null)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="mute" style={{ margin: "16px 8px 0", fontSize: 14 }}>Whatever you choose, the student sees it in Hunting Fox and gets the same message by email, with your WhatsApp and email under it.</p>
      {toast.el}
    </>
  );
}
