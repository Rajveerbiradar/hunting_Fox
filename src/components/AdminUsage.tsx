"use client";
import { useEffect, useState } from "react";
import { Spinner, copyText, useToast } from "./ui";

type D = { stats: [string, number][]; funnel: [string, number][]; days: [string, number][]; cost: { apify: number; perJob: number; ownKeyJobs: number }; timing: { median: number | null } };

/** The numbers for the Beep write-up. */
export function AdminUsage() {
  const [range, setRange] = useState("all");
  const [d, setD] = useState<D | null>(null);
  const toast = useToast();
  useEffect(() => { setD(null); fetch(`/api/admin/usage?range=${range}`, { cache: "no-store" }).then((r) => r.json()).then(setD); }, [range]);

  const max = d ? Math.max(1, ...d.days.map((x) => x[1])) : 1;
  const top = d?.funnel[0]?.[1] || 1;
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 24 }}>
        <div className="seg" role="tablist" aria-label="Time range">
          {([["today", "Today"], ["48h", "Last 48 hours"], ["all", "All time"]] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={range === k} onClick={() => setRange(k)}>{l}</button>)}
        </div>
        <button className="btn on-grey" disabled={!d} onClick={async () => d && toast.show((await copyText(d.stats.map(([l, n]) => `${l}: ${n}`).join("\n"))) ? "Numbers copied" : "Couldn't copy")}>Copy numbers as text</button>
      </div>
      {!d ? <div className="card row" style={{ marginTop: 16 }}><Spinner size={20} />Counting…</div> : (
        <>
          <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(150px,100%), 1fr))", gap: 12 }}>
            {d.stats.map(([l, n], i) => (
              <div key={l} className="card" style={{ padding: "16px 18px", ...(i === 2 ? { boxShadow: "inset 0 0 0 2px var(--ink)" } : {}) }}>
                <div style={{ fontSize: i === 2 ? 36 : 30, fontWeight: 700, letterSpacing: "-.02em", fontVariantNumeric: "tabular-nums" }}>{n}</div>
                <div className="mute" style={{ fontSize: 14, fontWeight: 600 }}>{l}</div>
              </div>
            ))}
          </div>

          <h2 className="h2" style={{ margin: "40px 8px 0" }}>From sign-up to a reply</h2>
          <p className="mute" style={{ margin: "4px 8px 0", fontSize: 14 }}>How many students reached each step.</p>
          <div className="card" style={{ marginTop: 12, padding: "12px 20px" }}>
            {d.funnel.map(([l, n], i) => (
              <div key={l} style={{ display: "grid", gridTemplateColumns: "minmax(0,180px) minmax(0,1fr) 48px", gap: 12, alignItems: "center", padding: "10px 0", borderTop: i ? "1px solid var(--line)" : undefined }}>
                <span style={{ fontSize: 16 }}>{l}</span>
                <span style={{ height: 12, borderRadius: 6, background: "var(--fill)", overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: `${Math.round((n / top) * 100)}%`, background: i < 4 ? "var(--ink)" : "var(--green-solid)" }} /></span>
                <b style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{n}</b>
              </div>
            ))}
          </div>

          <h2 className="h2" style={{ margin: "40px 8px 0" }}>Searches per day</h2>
          <p className="mute" style={{ margin: "4px 8px 0", fontSize: 14 }}>Last 14 days.</p>
          <div className="card" style={{ marginTop: 12, padding: 20, overflowX: "auto" }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 160, minWidth: 14 * 34 }} role="img" aria-label={`Searches per day: ${d.days.map(([l, n]) => `${l} ${n}`).join(", ")}`}>
              {d.days.map(([l, n]) => (
                <div key={l} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>{n || ""}</span>
                  <span style={{ width: "100%", height: Math.max(2, Math.round((n / max) * 110)), background: "var(--ink)", borderRadius: "6px 6px 2px 2px" }} />
                  <span className="mute" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{l}</span>
                </div>
              ))}
            </div>
          </div>

          <h2 className="h2" style={{ margin: "40px 8px 0" }}>What it cost</h2>
          <div className="card" style={{ marginTop: 12 }}>
            {[["Apify credit used (all accounts)", `$${d.cost.apify.toFixed(2)}`], ["Per finished job", `$${d.cost.perJob.toFixed(3)}`], ["Searches on students' own keys", String(d.cost.ownKeyJobs)], ["Typical time to finish", d.timing.median != null ? `${d.timing.median}s` : "–"]].map(([l, v]) => (
              <div key={l} className="row"><span style={{ flex: 1, fontSize: 16 }}>{l}</span><b style={{ fontVariantNumeric: "tabular-nums" }}>{v}</b></div>
            ))}
          </div>
          <p className="mute" style={{ margin: "16px 8px 0", fontSize: 14 }}>AI cost isn&apos;t tracked here: check your provider&apos;s dashboard. Apify is the credit used across every account since each was added.</p>
        </>
      )}
      {toast.el}
    </>
  );
}
