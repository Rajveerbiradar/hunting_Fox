// Shared by the paste box (browser) and POST /api/jobs (server).

export type LinkCheck =
  | { kind: "empty"; msg: string }
  | { kind: "bad"; msg: string }
  | { kind: "ok"; msg: string; url: string; portal: "linkedin" | "naukri" };

const HOW = "Open the job on LinkedIn or Naukri, then copy its link from Share or the address bar.";

export function checkLink(raw: string): LinkCheck {
  const t = (raw || "").trim();
  if (!t) return { kind: "empty", msg: HOW };
  const m = t.match(/https?:\/\/\S+/);
  const url = (m ? m[0] : t).replace(/[)\].,]+$/, "");
  const extracted = !!m && m[0] !== t;
  if (/internshala\.com/i.test(url))
    return { kind: "bad", msg: "We don't work with Internshala yet. For now, paste a job from LinkedIn or Naukri." };
  if (/linkedin\.com\/company\//i.test(url))
    return { kind: "bad", msg: "That's a company page, not a job. Open the job you want on LinkedIn and copy its link." };
  if (/linkedin\.com\/in\//i.test(url))
    return { kind: "bad", msg: "That's someone's profile, not a job. Open the job you want and copy its link." };
  if (/lnkd\.in\//i.test(url))
    return { kind: "ok", msg: "Got it. That's a short LinkedIn link, and we'll open it to find the job.", url, portal: "linkedin" };
  const li = url.match(/linkedin\.com\/jobs\/(?:view\/(?:[^/?#]*-)?(\d+)|.*[?&]currentJobId=(\d+))/i);
  if (li) {
    const id = li[1] || li[2];
    return {
      kind: "ok",
      msg: extracted ? "Got it. We found the job link inside the message you pasted." : "Looks good.",
      url: `https://www.linkedin.com/jobs/view/${id}`,
      portal: "linkedin",
    };
  }
  if (/naukri\.com\/job-listings/i.test(url))
    return {
      kind: "ok",
      msg: extracted ? "Got it. We found the job link inside the message you pasted." : "Looks good.",
      url: url.split("?")[0],
      portal: "naukri",
    };
  return { kind: "bad", msg: "We couldn't find a job link in that. " + HOW };
}
