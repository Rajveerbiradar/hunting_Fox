"use client";
import { useEffect, useState } from "react";
import { Spinner, copyText, useSort, useToast } from "./ui";

type R = { id: number; contact: string; created_at: string; removed_at: string | null; found: number };
function ago(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.floor(m / 60)} h ago` : `${Math.floor(m / 1440)} days ago`;
}
function due(iso: string) {
  const h = Math.round((new Date(iso).getTime() + 48 * 3600_000 - Date.now()) / 3600_000);
  return h <= 0 ? "overdue" : h < 24 ? `due in ${h} h` : `due in 1 day ${h - 24} h`;
}

/** People shown to students who asked to be removed. The page promises 2 days. */
export function AdminRemovals({ onCount }: { onCount?: (n: number) => void }) {
  const [rows, setRows] = useState<R[] | null>(null);
  const [tab, setTab] = useState<"open" | "done">("open");
  const [busy, setBusy] = useState(0);
  const sorter = useSort("admin_removals");
  const toast = useToast();
  const load = () => fetch("/api/admin/removals", { cache: "no-store" }).then((r) => r.json()).then((d) => { setRows(d.requests || []); onCount?.((d.requests || []).filter((x: R) => !x.removed_at).length); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  if (!rows) return <div className="card row" style={{ marginTop: 16 }}><Spinner size={20} />Loading…</div>;
  const list = sorter.sort(rows).filter((r) => (tab === "open" ? !r.removed_at : !!r.removed_at));
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 24 }}>
        <div className="seg" role="tablist">
          <button role="tab" aria-selected={tab === "open"} onClick={() => setTab("open")}>To do · {rows.filter((r) => !r.removed_at).length}</button>
          <button role="tab" aria-selected={tab === "done"} onClick={() => setTab("done")}>Removed</button>
        </div>
        {list.length > 1 && sorter.button}
      </div>
      <div className="card" style={{ marginTop: 16, overflow: "hidden" }}>
        {!list.length && <div style={{ padding: "24px 20px" }}><b>{tab === "open" ? "Nothing to remove" : "Nothing removed yet"}</b><div className="mute" style={{ fontSize: 16, marginTop: 4 }}>Requests from the &quot;Remove my info&quot; page show up here.</div></div>}
        {list.map((r, i) => (
          <div key={r.id} className="row" style={{ borderTop: i ? "1px solid var(--line)" : undefined }}>
            <div style={{ flex: "1 1 260px", minWidth: 0 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 16, fontWeight: 700, wordBreak: "break-all" }}>{r.contact}</span>
                <span className="tag" style={r.removed_at ? { background: "var(--green-bg)", color: "var(--green)" } : due(r.created_at) === "overdue" ? { background: "var(--red-bg)", color: "var(--red)", fontWeight: 700 } : { background: "var(--tile)", color: "var(--mute)" }}>{r.removed_at ? "✓ Removed" : due(r.created_at) === "overdue" ? "Overdue" : "To do"}</span>
              </div>
              <div className="mute" style={{ fontSize: 14, marginTop: 2 }}>Asked {ago(r.created_at)} · shown in {r.found} {r.found === 1 ? "job" : "jobs"}{r.removed_at ? "" : ` · ${due(r.created_at)}`}</div>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button className="btn sec sm" onClick={async () => toast.show((await copyText(r.contact)) ? "Copied" : "Select it to copy")}>Copy</button>
              {!r.removed_at && <button className="btn sec sm" disabled={busy === r.id} onClick={async () => { setBusy(r.id); const d = await fetch("/api/admin/removals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: r.id }) }).then((x) => x.json()); setBusy(0); toast.show(`Removed from ${d.removedFrom ?? 0} jobs and blocked`); load(); }}>{busy === r.id ? <Spinner size={14} /> : null}Mark as removed</button>}
            </div>
          </div>
        ))}
      </div>
      <p className="mute" style={{ margin: "16px 8px 0", fontSize: 14 }}>&quot;Mark as removed&quot; deletes this person from every saved people list and blocks them from future scans.</p>
      {toast.el}
    </>
  );
}
