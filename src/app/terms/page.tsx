import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Terms · Hunting Fox" };

export default function Page() {
  return (
    <LegalPage
      title="Terms of service"
      updated="18 November 2026"
      sections={[
        ["What Hunting Fox is", [
          "Hunting Fox is a free personal project run by Rajveer Biradar, a person, not a company. You paste a LinkedIn job link and it shows what to change in your resume for that job, people who work there, and messages you can send them yourself.",
          "By signing in you agree to these terms. If you don't agree, please don't use it.",
        ]],
        ["Access and searches", [
          "Students are let in by hand and get a set number of searches. Rajveer can change the number, pause new searches, or remove access at any time, for example if credit runs out or the service is misused.",
          "It's free while it's being tested. There's no payment and no guarantee it will stay available.",
        ]],
        ["What you can and can't do", [
          "Use it to apply for jobs you actually want. Send messages yourself, one by one, and keep them honest and polite.",
          "Don't use it to collect people's details, send spam or bulk messages, scrape at scale, or harass anyone. Don't share your account or try to get around search limits. Accounts used this way are removed.",
        ]],
        ["Your own keys", [
          "If you add your own Apify or AI key, it's stored encrypted and used only for your own searches. You're responsible for that account and any costs on it. You can remove the key at any time in Account.",
        ]],
        ["What we show you", [
          "Company checks, people and resume suggestions come from public pages and AI, and can be wrong or out of date. Check before you rely on them. We only suggest skills you've told us you have. You decide what goes in your resume and what you send.",
          "Hunting Fox never applies, posts or sends messages for you, and doesn't promise any reply, interview or job.",
        ]],
        ["People who appear in results", [
          "If you work at a company and were shown to a student, you can ask to be removed at /remove-info. We remove you within 2 days and keep you out of future results.",
        ]],
        ["No warranty", [
          "Hunting Fox is provided as it is. As far as the law allows, Rajveer isn't liable for losses from using it, including missed jobs, wrong information or messages you chose to send.",
        ]],
        ["Changes", [
          "These terms can change as the project changes. The date at the top shows the latest version. Using Hunting Fox after a change means you accept it.",
        ]],
      ]}
    />
  );
}
