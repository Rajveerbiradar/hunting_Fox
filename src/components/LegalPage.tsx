import Link from "next/link";
import { CONTACT } from "@/lib/contact";

/** Shared layout for /terms and /privacy: plain words, one column. */
export function LegalPage({ title, updated, sections }: { title: string; updated: string; sections: [string, string[]][] }) {
  return (
    <main className="wrap" style={{ maxWidth: 720 }}>
      <Link href="/" className="back">← Home</Link>
      <h1 className="h1" style={{ marginTop: 12 }}>{title}</h1>
      <p className="mute" style={{ margin: "8px 0 0", fontSize: 14 }}>Last updated {updated}</p>
      <div className="card" style={{ marginTop: 24, padding: "8px 28px 24px" }}>
        {sections.map(([h, ps]) => (
          <section key={h} style={{ marginTop: 24 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{h}</h2>
            {ps.map((p, i) => <p key={i} style={{ margin: "8px 0 0", fontSize: 16, lineHeight: 1.6 }}>{p}</p>)}
          </section>
        ))}
        <section style={{ marginTop: 24 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Contact</h2>
          <p style={{ margin: "8px 0 0", fontSize: 16, lineHeight: 1.6 }}>{CONTACT.name} · {CONTACT.email} · WhatsApp {CONTACT.whatsappDisplay}</p>
        </section>
      </div>
      <p className="mute" style={{ margin: "16px 8px 0", fontSize: 14 }}><Link href="/terms">Terms</Link> · <Link href="/privacy">Privacy</Link> · <Link href="/remove-info">Remove my info</Link></p>
    </main>
  );
}
