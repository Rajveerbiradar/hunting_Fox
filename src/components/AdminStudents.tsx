"use client";
import { useState } from "react";
import { Icon, letterTile, useSort, useToast } from "./ui";
import { signupNotYet } from "@/lib/messages";

export type U = { id: string; name: string | null; email: string | null; approved: boolean; declined_at?: string | null; search_limit: number; approved_at: string | null; note: string | null; created_at: string; resume_added_at: string | null; used: number; ai_used?: number; ai_limit?: number };

function ago(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.floor(m / 60)} h ago` : `${Math.floor(m / 1440)} days ago`;
}

/** Approve sign-ups, set how many searches each student gets, or tell them "not yet". */
export function AdminStudents({ initial, me, defaultSearches, onWaiting }: { initial: U[]; me: string; defaultSearches: number; onWaiting?: (n: number) => void }) {
  const [users, setUsers] = useState(initial);
  const [tab, setTab] = useState<"waiting" | "approved" | "out" | "all">(initial.some((u) => !u.approved && u.email !== me) ? "waiting" : "approved");
  const [q, setQ] = useState("");
  const [limits, setLimits] = useState<Record<string, string>>({});
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [declining, setDeclining] = useState<string | null>(null);
  const [dmsg, setDmsg] = useState("");
  const sorter = useSort("admin_students");
  const toast = useToast();

  async function update(id: string, patch: Partial<U> & { decline?: boolean; message?: string; ai_add?: number }, msg = "Saved") {
    setUsers((x) => {
      const n = x.map((u) => (u.id === id ? { ...u, ...patch } : u));
      onWaiting?.(n.filter((u) => !u.approved && u.email !== me).length);
      return n;
    });
    const r = await fetch("/api/admin", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, ...patch }) });
    toast.show(r.ok ? msg : "Couldn't save. Try again.");
  }

  const waiting = users.filter((u) => !u.approved && u.email !== me);
  const out = users.filter((u) => u.approved && u.used >= u.search_limit);
  const base = tab === "waiting" ? waiting : tab === "approved" ? users.filter((u) => u.approved) : tab === "out" ? out : users;
  const needle = q.trim().toLowerCase();
  const shown = sorter.sort(base).filter((u) => !needle || `${u.name} ${u.email} ${u.note}`.toLowerCase().includes(needle));
  const picked = waiting.filter((u) => sel[u.id]);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 24 }}>
        <div className="seg" role="tablist" aria-label="Which students">
          {([["waiting", `Waiting · ${waiting.length}`], ["approved", "Approved"], ["out", `Out of searches · ${out.length}`], ["all", "Everyone"]] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input className="in" style={{ width: 220, flex: "none", background: "#fff" }} placeholder="Search name or email" aria-label="Search students" value={q} onChange={(e) => setQ(e.target.value)} />
          {shown.length > 1 && sorter.button}
        </div>
      </div>

      {tab === "waiting" && picked.length > 0 && (
        <div className="card" style={{ marginTop: 16, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", background: "var(--ink)", color: "#fff" }}>
          <b style={{ flex: 1 }}>{picked.length} selected</b>
          <button className="btn pri sm" onClick={async () => { for (const u of picked) await update(u.id, { approved: true, search_limit: defaultSearches }, `${picked.length} approved with ${defaultSearches} searches each`); setSel({}); }}>Approve all</button>
          <button className="btn sm" style={{ background: "transparent", color: "#fff" }} onClick={() => setSel({})}>Clear</button>
        </div>
      )}

      <div className="card" style={{ marginTop: 16, overflow: "hidden" }}>
        {shown.length === 0 && <div style={{ padding: "24px 20px" }} className="mute">{tab === "waiting" ? "No one is waiting. Share your link and new sign-ups show up here." : needle ? "No one matches that." : "No one here yet."}</div>}
        {shown.map((u, i) => {
          const t = letterTile(u.name || u.email || "?");
          const limitVal = limits[u.id] ?? String(u.approved ? u.search_limit : defaultSearches);
          const isWaiting = !u.approved && u.email !== me;
          return (
            <div key={u.id} className="row" style={{ alignItems: "flex-start", borderTop: i ? "1px solid var(--line)" : undefined }}>
              {tab === "waiting" && <input type="checkbox" aria-label={`Select ${u.name || u.email}`} checked={!!sel[u.id]} onChange={() => setSel({ ...sel, [u.id]: !sel[u.id] })} style={{ width: 22, height: 22, marginTop: 13, accentColor: "#101828" }} />}
              <span className="tile" style={{ width: 48, height: 48, background: t.bg, color: t.fg, fontWeight: 700, fontSize: t.letters.length > 1 ? 16 : 18 }}>{t.letters}</span>
              <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 18, fontWeight: 700 }}>{u.name || "No name"}</span>
                  {u.approved && u.used >= u.search_limit && <span className="tag" style={{ background: "var(--tile)", color: "var(--mute)" }}>Used all searches</span>}
                  {isWaiting && u.declined_at && <span className="tag" style={{ background: "var(--tile)", color: "var(--mute)" }}>Told not yet · on the list</span>}
                </div>
                <div className="mute" style={{ fontSize: 14, wordBreak: "break-all" }}>{u.email}</div>
                {u.resume_added_at && <a className="btn sec sm" style={{ marginTop: 8 }} href={`/admin/students/${u.id}`} target="_blank" rel="noopener">Resumes and changes</a>}
                <div className="mute" style={{ fontSize: 14, marginTop: 4 }}>
                  Signed up {ago(u.created_at)}{u.resume_added_at ? " · resume added" : ""}{u.approved ? ` · used ${u.used} of ${u.search_limit}` : ""}
                </div>
                {u.email === me && (
                  <div className="mute" style={{ marginTop: 8, fontSize: 14 }}><span style={{ fontWeight: 600, color: "var(--ink)" }}>AI credits</span> · no limit (admin)</div>
                )}
                {u.approved && u.email !== me && u.ai_limit != null && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 8, fontSize: 14 }}>
                    <span style={{ fontWeight: 600 }}>AI credits</span>
                    <span className="mute">{Math.round((u.ai_used || 0) / 1000)}k of {Math.round(u.ai_limit / 1000)}k tokens used{u.ai_limit ? ` (${Math.min(100, Math.round(((u.ai_used || 0) / u.ai_limit) * 100))}%)` : ""}</span>
                    {(u.ai_used || 0) >= u.ai_limit * 0.9 && <span className="tag" style={{ background: "#FFEFB0", color: "#4F3E00" }}>⚠ {(u.ai_used || 0) >= u.ai_limit ? "Used up" : "Low"}</span>}
                    <button className="btn sec" style={{ minHeight: 32, fontSize: 13 }} onClick={() => update(u.id, { ai_add: 100000 }, `Added 100k AI tokens for ${(u.name || "them").split(" ")[0]}`)}>+100k</button>
                    <button className="btn sec" style={{ minHeight: 32, fontSize: 13 }} onClick={() => update(u.id, { ai_add: 250000 }, `Added 250k AI tokens for ${(u.name || "them").split(" ")[0]}`)}>+250k</button>
                  </div>
                )}
                <input className="in" style={{ marginTop: 8, width: "100%", minHeight: 36, fontSize: 14 }} placeholder="Private note, e.g. where they came from" defaultValue={u.note || ""} onBlur={(e) => e.target.value !== (u.note || "") && update(u.id, { note: e.target.value })} aria-label={`Note for ${u.email}`} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <label className="mute" htmlFor={`l-${u.id}`} style={{ fontSize: 14, fontWeight: 600 }}>Searches</label>
                <input id={`l-${u.id}`} className="in" inputMode="numeric" style={{ width: 76, flex: "none" }} value={limitVal} onChange={(e) => setLimits({ ...limits, [u.id]: e.target.value.replace(/\D/g, "") })} />
                {u.approved ? (
                  <>
                    <button className="btn sec" disabled={Number(limitVal) === u.search_limit} onClick={() => update(u.id, { search_limit: Number(limitVal) })}>Save</button>
                    {u.email !== me && <button className="btn danger" style={{ marginLeft: 8 }} onClick={() => update(u.id, { approved: false }, "Access removed")}>Remove access</button>}
                  </>
                ) : (
                  <>
                    <button className="btn sec" onClick={() => update(u.id, { approved: true, search_limit: Number(limitVal) || defaultSearches }, `${(u.name || "Student").split(" ")[0]} approved`)}>{Icon.check(18)}Approve</button>
                    <button className="btn ghost" onClick={() => { setDeclining(u.id); setDmsg(signupNotYet(u.name)); }}>{u.declined_at ? "Send again" : "Not yet"}</button>
                  </>
                )}
              </div>
              {declining === u.id && (
                <div style={{ flexBasis: "100%", display: "flex", flexDirection: "column", gap: 12, padding: 16, background: "var(--sunken)", borderRadius: 18, cornerShape: "squircle" } as React.CSSProperties}>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>Can&apos;t let {(u.name || "them").split(" ")[0]} in yet</div>
                  <label htmlFor={`d-${u.id}`} style={{ fontSize: 14, fontWeight: 600 }}>Message (you can edit it)</label>
                  <textarea id={`d-${u.id}`} className="ta" rows={7} value={dmsg} onChange={(e) => setDmsg(e.target.value)} />
                  <div className="mute" style={{ fontSize: 14 }}>They see this in Hunting Fox and by email, with your WhatsApp and email under it. Their place on the waiting list is kept.</div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button className="btn pri" onClick={async () => { await update(u.id, { decline: true, message: dmsg, declined_at: new Date().toISOString() }, "Sent. Their place on the waiting list is kept."); setDeclining(null); }}>Send</button>
                    <button className="btn ghost" onClick={() => setDeclining(null)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="mute" style={{ margin: "16px 8px 0", fontSize: 14 }}>Approving gives the student the number of searches in the box. Failed, closed and fake jobs never count, nor searches on the student&apos;s own key. Removing access keeps their saved jobs but stops new searches.</p>
      {toast.el}
    </>
  );
}
