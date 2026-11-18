"use client";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import Link from "next/link";
import { browserClient } from "@/lib/supabase/browser";
import { Icon, Spinner } from "@/components/ui";

const GoogleG = () => (
  <svg aria-hidden width="20" height="20" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>
);

function SignIn() {
  const link = useSearchParams().get("link") || "";
  const [busy, setBusy] = useState(false);
  async function google() {
    setBusy(true);
    const next = link ? `/?link=${encodeURIComponent(link)}` : "/";
    await browserClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
  }
  return (
    <main className="wrap" style={{ maxWidth: 460, paddingTop: 96 }}>
      <div className="card" style={{ padding: "36px 32px", display: "flex", flexDirection: "column", gap: 22, boxShadow: "0 12px 40px rgba(16, 24, 40,.08)" }}>
        <span className="lm" style={{ width: 48, height: 48, borderRadius: 18 }}>{Icon.fox(30)}</span>
        <div>
          <h1 className="h1">Sign in to continue</h1>
          <p className="mute" style={{ margin: "10px 0 0", fontSize: 16, lineHeight: 1.5 }}>We&apos;ll keep this job saved for you. Once you&apos;re in, it takes about a minute to look into it.</p>
        </div>
        {link && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "var(--sunken)", borderRadius: 18 }}>
            <span style={{ color: "var(--green)" }}>{Icon.check(20)}</span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>We kept your job link</div>
              <div className="mute" style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{link.replace(/^https?:\/\/(www\.)?/, "")}</div>
            </div>
          </div>
        )}
        <button className="btn lg gbtn loading" onClick={google} disabled={busy} aria-busy={busy} style={{ width: "100%" }}>{busy ? <Spinner size={20} /> : <GoogleG />}{busy ? "Opening Google…" : "Continue with Google"}</button>
        <p className="mute" style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>We only see your name and email address. We never post, apply or send messages for you. By continuing you agree to the <Link href="/terms">terms</Link> and <Link href="/privacy">privacy policy</Link>.</p>
      </div>
      <p style={{ textAlign: "center", marginTop: 20, fontSize: 14 }}><Link href="/" className="mute">← Back</Link></p>
    </main>
  );
}

export default function Page() {
  return <Suspense><SignIn /></Suspense>;
}
