"use client";
import { useEffect, useState } from "react";
import { Header } from "./ui";
import { AdminStudents, type U } from "./AdminStudents";
import { AdminRequests } from "./AdminRequests";
import { AdminJobs } from "./AdminJobs";
import { AdminKeys } from "./AdminKeys";
import { AdminUsage } from "./AdminUsage";
import { AdminRemovals } from "./AdminRemovals";
import { AdminSettings } from "./AdminSettings";

type Data = { users: U[]; stats: { students: number; started: number; finished: number; failed: number; applied: number } };
type Sec = "students" | "requests" | "jobs" | "keys" | "usage" | "removals" | "settings";

const NAV: { k: Sec; label: string; sub: string; icon: string }[] = [
  { k: "students", label: "Students", sub: "Approve sign-ups, set how many searches each student gets, or tell them \"not yet\".", icon: "M9 8a3.5 3.5 0 1 0 0-.01M2.5 20a6.5 6.5 0 0 1 13 0M15.5 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2A6.5 6.5 0 0 1 21.5 20" },
  { k: "requests", label: "Search requests", sub: "Students who ran out and asked for more. Whatever you choose, they see it in the app and by email.", icon: "M3 13l2.5-7.5A2 2 0 0 1 7.4 4h9.2a2 2 0 0 1 1.9 1.5L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 13h5l1.5 2.5h5L16 13h5" },
  { k: "jobs", label: "Jobs", sub: "Every job link students pasted. Failed ones show why and can be run again.", icon: "M3 9.5a2.5 2.5 0 0 1 2.5-2.5h13A2.5 2.5 0 0 1 21 9.5v8.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 18zM8.5 7V5.5a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2V7" },
  { k: "keys", label: "API keys", sub: "Every key is tested before it can be saved. Keys are stored encrypted and only their last 4 characters are shown.", icon: "M8 19.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM11.2 11.8L20 3M16 7l3 3M14 9l2 2" },
  { k: "usage", label: "Usage", sub: "The numbers for your Beep write-up.", icon: "M4 20V10M10 20V4M16 20v-7M22 20H2" },
  { k: "removals", label: "Removal requests", sub: "People shown to students who asked to be removed. Remove them within 2 days, as the page promises.", icon: "M12 2.8l7.5 3v5.6c0 4.8-3.2 8.2-7.5 9.8-4.3-1.6-7.5-5-7.5-9.8V5.8zM9.5 9.5l5 5M14.5 9.5l-5 5" },
  { k: "settings", label: "Settings", sub: "How Hunting Fox runs while you test it.", icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" },
];

/** /admin: one page, a menu on the left (on top on a phone), one section at a time. #hash keeps your place. */
export function AdminPanel({ initial, me, defaultSearches }: { initial: Data; me: string; defaultSearches: number }) {
  const [sec, setSec] = useState<Sec>("students");
  const [counts, setCounts] = useState<Partial<Record<Sec, number>>>({ students: initial.users.filter((u) => !u.approved && u.email !== me).length });

  useEffect(() => {
    const read = () => { const h = location.hash.slice(1) as Sec; if (NAV.some((n) => n.k === h)) setSec(h); };
    read();
    window.addEventListener("hashchange", read);
    // Counts for the menu, loaded once in the background.
    fetch("/api/admin/requests").then((r) => r.json()).then((d) => setCounts((c) => ({ ...c, requests: (d.requests || []).filter((x: { status: string }) => x.status === "waiting").length }))).catch(() => {});
    fetch("/api/admin/removals").then((r) => r.json()).then((d) => setCounts((c) => ({ ...c, removals: (d.requests || []).filter((x: { removed_at: string | null }) => !x.removed_at).length }))).catch(() => {});
    return () => window.removeEventListener("hashchange", read);
  }, []);
  const go = (k: Sec) => { setSec(k); history.replaceState(null, "", `#${k}`); window.scrollTo({ top: 0 }); };
  const cur = NAV.find((n) => n.k === sec)!;
  const setCount = (k: Sec) => (n: number) => setCounts((c) => ({ ...c, [k]: n }));

  return (
    <>
      <Header signedIn initial={me[0]} admin />
      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "24px max(16px, env(safe-area-inset-right, 0px)) 96px max(16px, env(safe-area-inset-left, 0px))", display: "flex", gap: 32, flexWrap: "wrap", alignItems: "flex-start" }}>
        <nav aria-label="Admin" className="adnav">
          {NAV.map((n) => (
            <button key={n.k} type="button" aria-current={sec === n.k ? "page" : undefined} onClick={() => go(n.k)}>
              <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={n.icon} /></svg>
              <span style={{ flex: 1 }}>{n.label}</span>
              {!!counts[n.k] && <span className="cnt">{counts[n.k]}</span>}
            </button>
          ))}
        </nav>
        <main style={{ flex: "999 1 560px", minWidth: 0 }}>
          <h1 className="h1">{cur.label}</h1>
          <p className="mute" style={{ margin: "12px 0 0", fontSize: 16, maxWidth: "62ch" }}>{cur.sub}</p>
          {sec === "students" && <AdminStudents initial={initial.users} me={me} defaultSearches={defaultSearches} onWaiting={setCount("students")} />}
          {sec === "requests" && <AdminRequests onCount={setCount("requests")} />}
          {sec === "jobs" && <AdminJobs />}
          {sec === "keys" && <AdminKeys />}
          {sec === "usage" && <AdminUsage />}
          {sec === "removals" && <AdminRemovals onCount={setCount("removals")} />}
          {sec === "settings" && <AdminSettings />}
        </main>
      </div>
    </>
  );
}
