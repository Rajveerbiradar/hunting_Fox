"use client";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { browserClient } from "@/lib/supabase/browser";
import { Icon } from "@/components/ui";

function SignIn() {
  const link = useSearchParams().get("link") || "";
  async function google() {
    const next = link ? `/?link=${encodeURIComponent(link)}` : "/";
    await browserClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
  }
  return (
    <main className="wrap" style={{ maxWidth: 460, paddingTop: 96 }}>
      <div className="card" style={{ padding: "36px 32px", display: "flex", flexDirection: "column", gap: 22, boxShadow: "0 12px 40px rgba(0,0,0,.08)" }}>
        <span className="lm" style={{ width: 52, height: 52, borderRadius: 20 }}>{Icon.check(26)}</span>
        <div>
          <h1 className="h2" style={{ fontSize: 28 }}>Sign in to continue</h1>
          <p className="mute" style={{ margin: "10px 0 0", fontSize: 16, lineHeight: 1.5 }}>We&apos;ll save what we find for each job, so you can come back to it any time. It takes about a minute.</p>
        </div>
        {link && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "var(--bg)", borderRadius: 18 }}>
            <span style={{ color: "var(--green)" }}>{Icon.check(20)}</span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>We kept your job link</div>
              <div className="mute" style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{link.replace(/^https?:\/\/(www\.)?/, "")}</div>
            </div>
          </div>
        )}
        <button className="btn lg dark" onClick={google} style={{ width: "100%" }}>Continue with Google</button>
        <p className="mute" style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>We only see your name and email address. We never post, apply or send messages for you.</p>
      </div>
      <p style={{ textAlign: "center", marginTop: 20, fontSize: 14 }}><Link href="/" className="mute">← Back</Link></p>
    </main>
  );
}

export default function Page() {
  return <Suspense><SignIn /></Suspense>;
}
