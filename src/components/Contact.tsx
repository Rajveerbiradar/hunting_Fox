"use client";
import { Icon, copyText, useToast } from "./ui";
import { CONTACT } from "@/lib/contact";

export const WhatsAppIcon = (s = 20) => (
  <svg aria-hidden width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4.2 19.8l1.2-4A8.5 8.5 0 1 1 8.6 19z" />
    <path d="M9.2 8.6c.2-.5.5-.5.8-.5h.5c.2 0 .4 0 .5.4l.6 1.4c.1.2 0 .4-.1.6l-.5.6c-.1.1-.1.3 0 .5a5.6 5.6 0 0 0 2.4 2.1c.2.1.4.1.5 0l.6-.7c.2-.2.4-.2.6-.1l1.4.7c.2.1.3.3.3.5 0 .9-.7 1.6-1.6 1.7-2.8.2-6-2.9-5.9-5.6 0-.6.2-1.2.4-1.6z" />
  </svg>
);

const CopyIcon = (s = 18) => (
  <svg aria-hidden width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="8" width="12" height="12" rx="3" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>
);

/** Rajveer's WhatsApp and email, each with copy and open on the same line. WhatsApp first: students answer it faster. */
export function ContactRows({ text, primary = false }: { text: string; primary?: boolean }) {
  const toast = useToast();
  const t = encodeURIComponent(text);
  const rows = [
    { key: "wa", icon: WhatsAppIcon(20), label: "WhatsApp", value: CONTACT.whatsappDisplay, copy: `+${CONTACT.whatsappDigits}`, href: `https://wa.me/${CONTACT.whatsappDigits}?text=${t}`, open: "Open WhatsApp" },
    { key: "mail", icon: Icon.mail(20), label: "Email", value: CONTACT.email, copy: CONTACT.email, href: `mailto:${CONTACT.email}?subject=${encodeURIComponent("Hunting Fox")}&body=${t}`, open: "Write an email" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {rows.map((r, i) => (
        <div key={r.key} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "#fff", border: "1px solid var(--line)", borderRadius: 18, cornerShape: "squircle" } as React.CSSProperties}>
          <span className="tile" style={{ width: 40, height: 40, background: "var(--tile)", color: "var(--ink)" }}>{r.icon}</span>
          <div style={{ flex: "1 1 auto", minWidth: 0 }}>
            <div className="mute" style={{ fontSize: 12, fontWeight: 700 }}>{r.label}</div>
            <div style={{ fontSize: 16, fontWeight: 600, userSelect: "all", wordBreak: "break-word" }}>{r.value}</div>
          </div>
          <button className="btn sec" style={{ minWidth: 44, padding: 0 }} aria-label={`Copy ${r.label}`} onClick={async () => toast.show((await copyText(r.copy)) ? `${r.label === "Email" ? "Email" : "Number"} copied` : "Select it to copy")}>{CopyIcon()}</button>
          <a className={`btn ${primary && i === 0 ? "pri" : "sec"}`} href={r.href} target={r.key === "wa" ? "_blank" : undefined} rel="noopener" aria-label={r.open}>{Icon.ext(16)}<span className="hide-sm">{r.open}</span></a>
        </div>
      ))}
      {toast.el}
    </div>
  );
}
