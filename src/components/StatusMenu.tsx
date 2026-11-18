"use client";
import { useEffect, useRef, useState } from "react";
import { APPLY_STATUSES, statusOf } from "@/lib/status";
import { Icon } from "./ui";

/** Status pill that opens the shared status list (a bottom sheet on phones). */
export function StatusMenu({ jobId, value, onChange, alignLeft }: { jobId: string; value: string | null; onChange?: (v: string) => void; alignLeft?: boolean }) {
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState(value);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => setCur(value), [value]);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  async function pick(k: string) {
    setCur(k);
    setOpen(false);
    onChange?.(k);
    await fetch(`/api/jobs/${jobId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ apply_status: k }) });
  }
  const s = statusOf(cur);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className="btn" aria-expanded={open} onClick={() => setOpen(!open)} style={{ background: s?.bg || "#fff", color: s?.fg || "var(--ink)", border: s ? 0 : "1px solid #D5DAE1" }}>
        {s ? `${s.icon} ${s.label}` : "Did you apply?"}{Icon.down()}
      </button>
      {open && (
        <div className="menu" role="menu" style={alignLeft ? { left: 0, right: "auto" } : undefined}>
          <div style={{ padding: "10px 12px 6px", fontSize: 14, fontWeight: 700, color: "var(--mute)" }}>Where are you with this job?</div>
          {APPLY_STATUSES.map((o) => (
            <button key={o.key} className="mi" role="menuitemradio" aria-checked={cur === o.key} onClick={() => pick(o.key)}>
              <span style={{ width: 22, textAlign: "center" }}>{o.icon}</span>
              <span style={{ flex: 1 }}>{o.label}</span>
              {cur === o.key && <span style={{ color: "var(--pink)", fontWeight: 700 }}>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
