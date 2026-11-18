export const APPLY_STATUSES = [
  { key: "applied", label: "Applied", icon: "↗", bg: "#E7EFFA", fg: "#164A88" },
  { key: "no_reply", label: "No reply yet", icon: "…", bg: "#EEF1F5", fg: "#5B6472" },
  { key: "replied", label: "They replied", icon: "↩", bg: "#E2F2F2", fg: "#0B5D5E" },
  { key: "interview", label: "Got an interview", icon: "◷", bg: "#F0E9FD", fg: "#5B2E9E" },
  { key: "got_job", label: "Got the job", icon: "★", bg: "#E5F3E9", fg: "#1A6B3C" },
  { key: "not_selected", label: "Didn't get it", icon: "✕", bg: "#EEF1F5", fg: "#5B6472" },
  { key: "not_applying", label: "Not applying", icon: "–", bg: "#EEF1F5", fg: "#5B6472" },
] as const;

export type ApplyKey = (typeof APPLY_STATUSES)[number]["key"];
export const statusOf = (k?: string | null) => APPLY_STATUSES.find((s) => s.key === k);

export const STEPS = [
  { label: "Reading the job", running: "Opening the link" },
  { label: "Checking the company is real", running: "Looking at their LinkedIn page, website and who posted the job" },
  { label: "Finding people who work there", running: "Searching public LinkedIn profiles" },
  { label: "Working out what to change in your resume", running: "Comparing your resume with the people on this team" },
  { label: "Writing a message for each person", running: "Using what we found on each person's profile" },
];

export const SKILL_LEVELS = ["Never used it", "Know about it", "Used in a project", "Used at a company", "Use it daily", "Expert"];
/** Level 2+ ("Used in a project") goes on the resume. */
export const ADDS_TO_RESUME = (level: number) => level >= 2;

export const PROBLEMS: Record<string, { title: string; text: string; foot?: string }> = {
  fake: { title: "This job might not be real", text: "We couldn't confirm the company is real, so we stopped before doing anything else for this job.", foot: "This didn't use one of your free searches." },
  closed: { title: "This job is no longer open", text: "The company has stopped taking applications for this role. On LinkedIn this can happen within a day, when a lot of people apply. Look for a newer post, or paste a different job.", foot: "This didn't use one of your free searches." },
  not_found: { title: "We couldn't open this job", text: "The job page didn't load for us. It may have been removed, or the link may be incomplete. Copy the link again from the job's Share button.", foot: "This didn't use one of your free searches." },
  failed: { title: "Something went wrong on our side", text: "We couldn't finish looking into this job. This usually fixes itself. Your link is saved, so just try again in a minute.", foot: "This didn't use one of your free searches." },
  limit: { title: "You've used all your searches", text: "Everything you've found so far is still here: your resumes, messages and job list. Ask for more, and Rajveer will add them once he sees it." },
  own_key_out: { title: "Your Apify key ran out of credit", text: "We stopped because your key has no credit left and you asked us not to use your free searches. Apify adds $5 at the start of each month, or you can change this in Account → Use your own keys.", foot: "This didn't use one of your free searches." },
};
