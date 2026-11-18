import { notFound } from "next/navigation";
import { adminClient } from "@/lib/supabase/clients";
import { buildDiff } from "@/lib/resumeDiff";
import { ResumeSheet } from "@/components/ResumeSheet";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

/** Read-only resume link for LinkedIn notes (which can't carry attachments). */
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{18}$/.test(token)) notFound();
  const sb = adminClient();
  const { data: report } = await sb.from("reports").select("job_id,resume").eq("share_token", token).maybeSingle();
  if (!report) notFound();
  const { data: job } = await sb.from("jobs").select("user_id").eq("id", report.job_id).single();
  const { data: profile } = await sb.from("profiles").select("skills,resume_text").eq("id", job!.user_id).single();
  const levels = Object.fromEntries((profile?.skills || []).map((s: { name: string; level: number }) => [s.name.toLowerCase(), s.level]));
  const lines = report.resume ? buildDiff(report.resume, levels).final : (profile?.resume_text || "").split("\n");
  if (!lines.filter(Boolean).length) {
    return (
      <main className="wrap" style={{ maxWidth: 520, paddingTop: 96 }}>
        <div className="card" style={{ padding: 32 }}>
          <h1 className="h2">This resume isn&apos;t ready yet</h1>
          <p className="mute" style={{ fontSize: 16, lineHeight: 1.5, margin: "12px 0 0" }}>The student hasn&apos;t added it yet. Please ask them to send it directly.</p>
        </div>
      </main>
    );
  }
  return <ResumeSheet lines={lines} print={false} />;
}
