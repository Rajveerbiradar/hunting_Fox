"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { STEPS } from "@/lib/status";

export function Spinner({ size = 20, color = "#101828", label }: { size?: number; color?: string; label?: string }) {
  const big = size >= 32;
  const n = big ? 12 : 8;
  const step = 360 / n;
  const values = Array.from({ length: n }, (_, i) => `${i * step} 12 12`).join(";");
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <g stroke={color} strokeWidth={big ? 2 : 2.4} strokeLinecap="round">
        <animateTransform attributeName="transform" type="rotate" values={values} calcMode="discrete" dur={big ? "0.9s" : "0.8s"} repeatCount="indefinite" />
        {Array.from({ length: n }, (_, i) => (
          <line key={i} x1="12" y1={big ? 2.5 : 3} x2="12" y2={big ? 6.5 : 7} opacity={i === 0 ? 1 : 0.12 + (0.86 * (n - i)) / n} transform={`rotate(${-i * step} 12 12)`} />
        ))}
      </g>
    </svg>
  );
}

export const Icon = {
  // eslint-disable-next-line @next/next/no-img-element
  fox: (s = 22) => <img src="/fox-white.png" alt="" width={s} height={s} />,
  check: (s = 20) => <svg aria-hidden width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>,
  arrow: (s = 18) => <svg aria-hidden width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></svg>,
  back: (s = 18) => <svg aria-hidden width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>,
  chev: (s = 16) => <svg aria-hidden width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>,
  down: (s = 14) => <svg aria-hidden width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>,
  link: (s = 24) => <svg aria-hidden width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9.5 14.5l5-5" /><path d="M11 6.5l1.2-1.2a4.3 4.3 0 0 1 6.1 6.1L17.1 12.6" /><path d="M13 17.5l-1.2 1.2a4.3 4.3 0 0 1-6.1-6.1L6.9 11.4" /></svg>,
  doc: (s = 24) => <svg aria-hidden width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M13 21H8a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4h5l6 6v8a4 4 0 0 1-4 4" /><path d="M13 3v4a2 2 0 0 0 2 2h4" /><path d="M9 13h6M9 17h4" /></svg>,
  docEdit: (s = 24) => <svg aria-hidden width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M13 21H8a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4h5l6 6v3" /><path d="M13 3v4a2 2 0 0 0 2 2h4" /><path d="M18.4 14.6l1.9 1.9-4.6 4.6-2.5.6.6-2.5z" /></svg>,
  people: (s = 24) => <svg aria-hidden width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M15.5 4.6a3.5 3.5 0 0 1 0 6.8" /><path d="M18 14.2A6.5 6.5 0 0 1 21.5 20" /></svg>,
  mail: (s = 24) => <svg aria-hidden width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="4.5" width="19" height="15" rx="4" /><path d="M6.5 9l4.2 3a2.2 2.2 0 0 0 2.6 0l4.2-3" /></svg>,
  shield: (s = 20) => <svg aria-hidden width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2.8l7.5 3v5.6c0 4.8-3.2 8.2-7.5 9.8-4.3-1.6-7.5-5-7.5-9.8V5.8z" /><path d="M8.8 12l2.2 2.2 4.2-4.4" /></svg>,
  list: (s = 19) => <svg aria-hidden width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="4" /><path d="M7 9h4M7 13h7M7 17h3" /></svg>,
  upload: (s = 18) => <svg aria-hidden width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4.5" /><path d="M7 9l5-5 5 5" /><path d="M4 20.5h16" /></svg>,
  download: (s = 18) => <svg aria-hidden width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v11.5" /><path d="M7 11l5 5 5-5" /><path d="M4 20h16" /></svg>,
  ext: (s = 16) => <svg aria-hidden width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 4h6v6" /><path d="M20 4l-9 9" /><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" /></svg>,
  x: (s = 16) => <svg aria-hidden width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>,
  plus: (s = 18) => <svg aria-hidden width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>,
  info: (s = 18) => <svg aria-hidden width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="12" cy="12" r="9.5" /><path d="M12 11v5.5" /><path d="M12 7.6v.01" /></svg>,
};

export function Header({ signedIn, initial, home = "/", showJobs = true, admin }: { signedIn: boolean; initial?: string; home?: string; showJobs?: boolean; admin?: boolean }) {
  return (
    <header className="hd">
      <div className="hdi">
        <Link href={home} className="logo" aria-label="Hunting Fox home"><span className="lm">{Icon.fox(24)}</span><span className="wm">hunting fox</span></Link>
        {signedIn ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {admin && <Link href="/admin" className="btn on-grey">Admin</Link>}
            {showJobs && <Link href="/jobs" className="btn on-grey">{Icon.list(20)}My jobs</Link>}
            <Link href="/account" className="av" aria-label="Your account">{(initial || "?").toUpperCase()}</Link>
          </div>
        ) : (
          <Link href="/sign-in" style={{ fontSize: 16, fontWeight: 600, textDecoration: "none", padding: "10px 4px" }}>Sign in</Link>
        )}
      </div>
    </header>
  );
}

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="back">{Icon.back()}{children}</Link>;
}

export function useToast() {
  const [msg, setMsg] = useState("");
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((m: string) => {
    setMsg(m);
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => setMsg(""), 1600);
  }, []);
  const el = msg ? <div className="toast" role="status">{msg}</div> : null;
  return { show, el };
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Every company and person tile is neutral: the only colour in a row is its status. */
export function letterTile(name: string) {
  const clean = (name || "?").replace(/\(.*?\)/g, "").trim();
  const caps = clean.match(/[A-Z]/g) || [];
  const words = clean.split(/\s+/).filter(Boolean);
  // "FarmDidi" → FD, "Northwind Analytics" → NA, "Venxr" → V
  const letters = caps.length >= 2 ? caps[0] + caps[1] : words.length > 1 ? words[0][0] + words[1][0] : (words[0]?.[0] || "?");
  return { letters: letters.toUpperCase(), bg: "var(--tile)", fg: "var(--tile-ink)" };
}

/** What the server is doing for this job right now, with three blinking dots. */
export function LiveStep({ step, style }: { step?: number | null; style?: React.CSSProperties }) {
  const text = STEPS[Math.min(Math.max(step ?? 0, 0), STEPS.length - 1)].label;
  return (
    <span className="live" role="status" aria-live="polite" style={style}>
      {text}
      <span className="dots" aria-hidden><i /><i /><i /></span>
    </span>
  );
}

type LiveRow = { id: string; status: string; step?: number | null; company?: string | null; title?: string | null };
const isWorking = (r: LiveRow) => r.status === "queued" || r.status === "scanning";

/** Keeps rows in step with the server while any job is still being worked on. */
export function useLiveJobs<T extends LiveRow>(initial: T[]) {
  const [rows, setRows] = useState(initial);
  const working = rows.some(isWorking);
  useEffect(() => {
    if (!working) return;
    let alive = true;
    const t = setInterval(async () => {
      const r = await fetch("/api/jobs", { cache: "no-store" }).catch(() => null);
      const d = r && r.ok ? await r.json() : null;
      if (!alive || !d?.jobs) return;
      const fresh = new Map<string, LiveRow>(d.jobs.map((j: LiveRow) => [j.id, j]));
      setRows((x) => x.map((row) => {
        const f = fresh.get(row.id);
        return f ? { ...row, status: f.status, step: f.step, company: f.company ?? row.company, title: f.title ?? row.title } : row;
      }));
    }, 2500);
    return () => { alive = false; clearInterval(t); };
  }, [working]);
  return [rows, setRows] as const;
}

/**
 * Newest first / oldest first. One button, top right, with an arrow.
 * Remembers the choice per list in this browser.
 */
export function useSort(key: string) {
  const [order, setOrder] = useState<"new" | "old">("new");
  useEffect(() => {
    try { const v = localStorage.getItem(`hf_sort_${key}`); if (v === "old") setOrder("old"); } catch { /* storage blocked */ }
  }, [key]);
  const toggle = () => setOrder((o) => {
    const n = o === "new" ? "old" : "new";
    try { localStorage.setItem(`hf_sort_${key}`, n); } catch { /* storage blocked */ }
    return n;
  });
  const sort = <T extends { created_at: string }>(rows: T[]) =>
    [...rows].sort((a, b) => (order === "new" ? 1 : -1) * (new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
  const button = (
    <button type="button" className="btn on-grey" onClick={toggle} aria-label={order === "new" ? "Showing newest first. Switch to oldest first" : "Showing oldest first. Switch to newest first"}>
      {order === "new" ? "Newest first" : "Oldest first"}
      <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {order === "new" ? <><path d="M12 5v14" /><path d="M6 13l6 6 6-6" /></> : <><path d="M12 19V5" /><path d="M6 11l6-6 6 6" /></>}
      </svg>
    </button>
  );
  return { order, sort, button };
}
