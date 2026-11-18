// Optional: emails via Resend when RESEND_API_KEY and EMAIL_FROM are set. Otherwise does nothing.
import { appSettings } from "@/lib/secrets";

export async function sendEmail(to: string, subject: string, text: string) {
  const key = process.env.RESEND_API_KEY, from = process.env.EMAIL_FROM;
  if (!key || !from || !to) return;
  if (!(await appSettings().catch(() => ({ emailsOn: true }))).emailsOn) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to, subject, text }),
  }).catch(() => {});
}
