"use client";

import { useEffect, useState } from "react";
import { ContactRows } from "./Contact";
import { CONTACT } from "@/lib/contact";
import { FREE } from "@/lib/free";

/**
 * Shown once per account on this browser, the first time a signed-in student lands on Home:
 * how many searches they have, and how to get more from the admin (WhatsApp, email or a call, 1–3 hours).
 */
export function SearchesWelcome({ email, limit }: { email: string; limit: number }) {
  const [open, setOpen] = useState(false);
  const key = `hf:welcome:${email.toLowerCase()}`;
  useEffect(() => {
    try { if (!localStorage.getItem(key)) setOpen(true); } catch { /* storage blocked: skip the popup */ }
  }, [key]);
  function close() {
    setOpen(false);
    try { localStorage.setItem(key, "1"); } catch { /* fine */ }
  }
  if (!open) return null;
  const n = Math.max(limit, FREE);
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="sw-t" onClick={close} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(16,24,40,.45)", display: "grid", placeItems: "center", padding: 16 }}>
      <div className="card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460, width: "100%", padding: "24px 22px 20px" }}>
        <h2 id="sw-t" style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: "-.02em" }}>You&apos;ve got {n} free searches</h2>
        <p style={{ fontSize: 16, lineHeight: 1.55, margin: "10px 0 0" }}>
          Every account gets {FREE} searches to start. One search is one job link you paste.
        </p>
        <p style={{ fontSize: 16, lineHeight: 1.55, margin: "10px 0 14px" }}>
          Need more? Ask {CONTACT.name}, the admin: send a WhatsApp message, write an email, or give him a call. <b>Expect a reply in 1 to 3 hours.</b>
        </p>
        <ContactRows text="Hi Rajveer, I'm using Hunting Fox and I'd like more searches." />
        <p className="mute" style={{ fontSize: 14, margin: "10px 0 0" }}>To call, use the same number: {CONTACT.whatsappDisplay}</p>
        <button className="btn lg pri" style={{ marginTop: 16, width: "100%" }} onClick={close} autoFocus>Start searching</button>
      </div>
    </div>
  );
}
