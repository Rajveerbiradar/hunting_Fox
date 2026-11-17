"use client";
import { useState } from "react";
import { Header, letterTile, useToast } from "./ui";
import { AdminKeys } from "./AdminKeys";

type U = { id: string; name: string | null; email: string | null; approved: boolean; search_limit: number; approved_at: string | null; note: string | null; created_at: string; resume_added_at: string | null; used: number };
type Data = { users: U[]; stats: { students: number; started: number; finished: number; failed: number; applied: number } };

const DEFAULT_LIMIT = 25;

function ago(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.floor(m / 60)} h ago` : `${Math.floor(m / 1440)} days ago`;
}

export function AdminPanel({ initial, me }: { initial: Data; me: string }) {
  const [users, setUsers] = useState(initial.users);
  const [tab, setTab] = useState<"waiting" | "approved" | "all">(initial.users.some((u) => !u.approved) ? "waiting" : "approved");
  const [limits, setLimits] = useState<Record<string, string>>({});
  const [section, setSection] = useState<"students" | "keys">("students");
  const toast = useToast();

  async function update(id: string, patch: Partial<U>) {
    setUsers((x) => x.map((u) => (u.id === id ? { ...u, ...patch } : u)));
    const r = await fetch("/api/admin", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, ...patch }) });
    toast.show(r.ok ? "Saved" : "Couldn't save. Try again.");
  }

  const waiting = users.filter((u) => !u.approved && u.email !== me);
  const waitingCount = waiting.length;
  const shown = tab === "waiting" ? waiting : tab === "approved" ? users.filter((u) => u.approved) : users;
  const s = initial.stats;

  return (
    <>
      <Header signedIn initial={me[0]} admin />
      <main className="wrap wide">
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h1 className="h1">Admin</h1>
          <div className="seg" role="tablist" aria-label="Admin sections">
            <button role="tab" aria-selected={section === "students"} onClick={() => setSection("students")}>Students{waitingCount ? ` · ${waitingCount} waiting` : ""}</button>
            <button role="tab" aria-selected={section === "keys"} onClick={() => setSection("keys")}>API keys</button>
          </div>
        </div>
        {section === "keys" ? <AdminKeys /> : (<>
        <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(140px,100%), 1fr))", gap: 12 }}>
          {[["Students who searched", s.students], ["Searches started", s.started], ["Finished", s.finished], ["Failed", s.failed], ["Marked applied", s.applied]].map(([l, n]) => (
            <div key={l as string} className="card" style={{ padding: "16px 18px" }}>
              <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-.02em" }}>{n}</div>
              <div className="mute" style={{ fontSize: 13, fontWeight: 600 }}>{l}</div>
            </div>
          ))}
        </div>

        <div className="seg" role="tablist" style={{ marginTop: 32 }}>
          {([["waiting", `Waiting · ${waiting.length}`], ["approved", "Approved"], ["all", "Everyone"]] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          {shown.length === 0 && <div style={{ padding: "24px 20px" }} className="mute">{tab === "waiting" ? "No one is waiting. Share your link and new sign-ups show up here." : "No one here yet."}</div>}
          {shown.map((u) => {
            const t = letterTile(u.name || u.email || "?");
            const limitVal = limits[u.id] ?? String(u.approved ? u.search_limit : DEFAULT_LIMIT);
            return (
              <div key={u.id} className="row" style={{ alignItems: "flex-start" }}>
                <span className="tile" style={{ width: 44, height: 44, background: t.bg, color: t.fg, fontWeight: 800 }}>{t.letters}</span>
                <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{u.name || "No name"}</div>
                  <div className="mute" style={{ fontSize: 14, wordBreak: "break-all" }}>{u.email}</div>
                  <div className="mute" style={{ fontSize: 13, marginTop: 4 }}>
                    Signed up {ago(u.created_at)}{u.resume_added_at ? " · resume added" : ""}{u.approved ? ` · used ${u.used} of ${u.search_limit}` : ""}
                  </div>
                  <input className="in" style={{ marginTop: 8, width: "100%", minHeight: 36, fontSize: 14 }} placeholder="Private note, e.g. where they came from" defaultValue={u.note || ""} onBlur={(e) => e.target.value !== (u.note || "") && update(u.id, { note: e.target.value })} aria-label={`Note for ${u.email}`} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <label className="mute" htmlFor={`l-${u.id}`} style={{ fontSize: 13, fontWeight: 600 }}>Searches</label>
                  <input id={`l-${u.id}`} className="in" inputMode="numeric" style={{ width: 76, flex: "none" }} value={limitVal} onChange={(e) => setLimits({ ...limits, [u.id]: e.target.value.replace(/\D/g, "") })} />
                  {u.approved ? (
                    <>
                      <button className="btn sec" disabled={Number(limitVal) === u.search_limit} onClick={() => update(u.id, { search_limit: Number(limitVal) })}>Save</button>
                      <button className="btn ghost" style={{ color: "var(--red)" }} onClick={() => update(u.id, { approved: false })}>Remove access</button>
                    </>
                  ) : (
                    <button className="btn dark" onClick={() => update(u.id, { approved: true, search_limit: Number(limitVal) || DEFAULT_LIMIT })}>Approve</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        </>)}
        {section === "students" && <p className="mute" style={{ margin: "16px 8px 0", fontSize: 13 }}>Approving gives the student the number of searches in the box. Failed, closed and fake jobs never count. Removing access keeps their saved jobs but stops new searches.</p>}
      </main>
      {toast.el}
    </>
  );
}
