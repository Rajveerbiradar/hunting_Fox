"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { checkLink } from "@/lib/links";
import { Icon, Spinner } from "./ui";

/** The paste box. Checks the link as you type; signed-out students go to sign-in with the link kept. */
export function LinkBox({ signedIn, initial = "", onStarted }: { signedIn: boolean; initial?: string; onStarted: (id: string) => void }) {
  const router = useRouter();
  const [link, setLink] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const c = checkLink(link);

  useEffect(() => { setErr(""); }, [link]);

  async function go(e?: React.FormEvent) {
    e?.preventDefault();
    if (c.kind !== "ok" || busy) return;
    if (!signedIn) {
      router.push(`/sign-in?link=${encodeURIComponent(c.url)}`);
      return;
    }
    setBusy(true);
    const r = await fetch("/api/jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ link: c.url }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.status === 403) return setErr("You're on the waiting list. As soon as you're approved, this link will work.");
    if (r.status === 402) return setErr("You've used all your searches. Your saved jobs still work. Message Rajveer if you'd like more.");
    if (!r.ok) return setErr(d.msg || "Something went wrong on our side. Try again in a minute.");
    setLink("");
    if (d.duplicate) router.push(`/jobs/${d.id}`);
    else onStarted(d.id);
  }

  async function paste() {
    try {
      const t = await navigator.clipboard.readText();
      if (t) setLink(t);
    } catch {
      document.getElementById("joblink")?.focus();
    }
  }

  const msg = err || c.msg;
  const color = err || c.kind === "bad" ? "var(--red)" : c.kind === "ok" ? "var(--green)" : "var(--mute)";
  return (
    <>
      <form className={`card box${c.kind === "bad" || err ? " bad" : ""}`} style={{ marginTop: 32 }} onSubmit={go}>
        <span className="tile" style={{ background: "var(--bg)" }}>{Icon.link()}</span>
        <label htmlFor="joblink" className="sr">Job link</label>
        <input id="joblink" type="text" inputMode="url" autoComplete="off" placeholder="Paste a LinkedIn or Naukri job link" value={link} onChange={(e) => setLink(e.target.value)} aria-describedby="linkmsg" />
        {c.kind === "empty" && <button type="button" className="chip" onClick={paste}>Paste</button>}
        <button type="submit" className={`btn lg ${c.kind === "ok" ? "pri" : "off"}`} disabled={c.kind !== "ok" || busy}>
          {busy ? <Spinner size={18} color="#fff" /> : null}Show me what to do{!busy && Icon.arrow()}
        </button>
      </form>
      <div id="linkmsg" role="status" style={{ margin: "10px 8px 0", fontSize: 14, minHeight: 20, fontWeight: c.kind === "empty" && !err ? 400 : 600, color }}>{msg}</div>
    </>
  );
}
