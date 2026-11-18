import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Privacy · Hunting Fox" };

export default function Page() {
  return (
    <LegalPage
      title="Privacy policy"
      updated="18 November 2026"
      sections={[
        ["What we collect", [
          "From Google sign-in: your name and email address. Nothing else from your Google account.",
          "What you give us: your resume, the skills, links and education you add, the job links you paste, and how each application went.",
          "If you add your own Apify or AI key, the key itself, stored encrypted.",
        ]],
        ["What we use it for", [
          "Only to run Hunting Fox for you: suggest resume changes for a job, find people who work there, write messages you can send, and remind you to follow up. Rajveer also looks at overall numbers (for example, how many searches finished) to improve it.",
          "We don't sell your data, show ads, or send anything on your behalf.",
        ]],
        ["Who else handles it", [
          "Supabase stores the data. Vercel runs the site. Apify fetches public job and company pages. An AI provider (for example Anthropic) writes resume suggestions and messages, and sees the parts of your resume needed for that. If emails are on, Resend sends them.",
        ]],
        ["People shown in results", [
          "We show students public details from LinkedIn profiles (name, role, how long someone has worked there) so they know who to ask. Anyone can ask to be removed at /remove-info, and we do it within 2 days.",
        ]],
        ["Keeping and deleting", [
          "Your data stays until you delete it or ask Rajveer to. You can remove your resume and keys in Account. To delete your whole account, message Rajveer and it's done within 7 days.",
        ]],
        ["Cookies", [
          "Only the ones needed to keep you signed in. No tracking or advertising cookies.",
        ]],
      ]}
    />
  );
}
