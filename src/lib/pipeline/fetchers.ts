/* eslint-disable @typescript-eslint/no-explicit-any */
import { runActor, addRows } from "@/lib/apify";
import type { CompanyData, JobData, Person } from "./types";

const str = (v: any) => (typeof v === "string" ? v : v == null ? "" : String(v));

export function domainOf(website?: string) {
  if (!website) return undefined;
  return website.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split(/[/?#]/)[0].toLowerCase() || undefined;
}

function sizeMin(text?: string) {
  const m = (text || "").replace(/,/g, "").match(/(\d+)/);
  return m ? Number(m[1]) : undefined;
}

const GENERIC = new Set(["app", "apps", "inc", "llc", "ltd", "limited", "pvt", "private", "technologies", "technology", "tech", "india", "solutions", "labs", "the", "co", "company", "group", "services", "software", "global"]);

/**
 * Does a headline name this company? Matches any distinctive word of the name or the website's name,
 * ignoring spaces and case ("Beep App" / eventbeep.com matches "HR at EventBeep"). true when it does,
 * undefined when we can't tell (we never say someone doesn't work there just from a headline).
 */
function mentionsCompany(headline: string, company: CompanyData): true | undefined {
  const h = headline.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!h) return undefined;
  const words = (company.name || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !GENERIC.has(w));
  const stem = (company.domain || "").split(".")[0];
  return words.some((w) => h.includes(w)) || (stem.length >= 3 && h.includes(stem)) ? true : undefined;
}

/** LinkedIn: automation_craft/linkedin-job-details-scraper */
export async function fetchLinkedIn(url: string, own?: string | null): Promise<{ job: JobData; company: CompanyData }> {
  const { items } = await runActor<any>("automation_craft/linkedin-job-details-scraper", {
    jobUrls: [url],
    includeCompanyDetails: true,
    includeJobPoster: true,
  }, { timeoutSec: 90, ownToken: own });
  const j = items.find((x) => x.type === "job") || items.find((x) => x.type !== "summary");
  if (!j) throw new Error("JOB_NOT_FOUND");
  const c = j.company || {};
  const poster = j.jobPoster || j.poster || {};
  const company: CompanyData = {
    name: str(c.name || j.companyName),
    website: str(c.website) || undefined,
    domain: domainOf(c.website),
    linkedinUrl: str(c.url || j.companyUrl) || undefined,
    sizeText: str(c.companySize) || undefined,
    sizeMin: sizeMin(c.companySize),
    founded: c.foundedYear ? Number(c.foundedYear) : undefined,
    industry: str(c.industry) || undefined,
    hq: str(c.headquarters) || undefined,
  };
  const job: JobData = {
    title: str(j.title || j.jobTitle),
    company: company.name,
    location: str(j.location) || undefined,
    description: str(j.descriptionText || j.description).slice(0, 6000),
    keySkills: Array.isArray(j.skills) ? j.skills.map(str) : [],
    postedText: str(j.postedDate || j.postedAt) || undefined,
    applicantsText: str(j.applicantsText) || undefined,
    jobState: str(j.jobState) || undefined,
    applyUrl: str(j.applyUrl) || url,
    poster: poster && (poster.name || poster.title)
      ? { name: str(poster.name), title: str(poster.title || poster.headline), url: str(poster.url || poster.profileUrl || poster.linkedinUrl) || undefined, worksThere: mentionsCompany(str(poster.title || poster.headline), company) }
      : undefined,
  };
  return { job, company };
}

/** Naukri: blackfalcondata/naukri-jobs-feed */
export async function fetchNaukri(url: string, own?: string | null): Promise<{ job: JobData; company: CompanyData }> {
  const { items } = await runActor<any>("blackfalcondata/naukri-jobs-feed", { startUrls: [url], maxResults: 1 }, { timeoutSec: 60, ownToken: own });
  const j = items[0];
  if (!j) throw new Error("JOB_NOT_FOUND");
  const ab = j.ambitionBoxDetails?.companyInfo || {};
  const website = str(j.companyWebsite || j.companyDetail?.websiteUrl) || undefined;
  const company: CompanyData = {
    name: str(j.companyName || j.company),
    website,
    domain: domainOf(website),
    rating: ab.rating ? Number(ab.rating) : undefined,
    reviews: ab.reviewsCount ? Number(ab.reviewsCount) : undefined,
  };
  const job: JobData = {
    title: str(j.title || j.jobTitle),
    company: company.name,
    location: Array.isArray(j.locations) ? j.locations.join(", ") : str(j.location) || undefined,
    description: str(j.jobDescription || j.description).replace(/<[^>]+>/g, " ").slice(0, 6000),
    keySkills: Array.isArray(j.keySkills) ? j.keySkills.map((k: any) => str(k.label || k)) : [],
    postedText: str(j.createdDate || j.footerPlaceholderLabel) || undefined,
    applyUrl: url,
    hiringEmail: str(j.contactEmail) || undefined,
    consultant: !!j.consultant,
  };
  return { job, company };
}

const STOP = new Set(["intern", "internship", "senior", "junior", "sr", "jr", "trainee", "fresher", "lead", "the", "and", "of", "for", "-", "&", "i", "ii", "iii"]);

const ROLE_NOUN: Record<string, string> = { design: "Designer", development: "Developer", engineering: "Engineer", marketing: "Marketing", analytics: "Analyst", analysis: "Analyst", sales: "Sales", product: "Product", content: "Content", data: "Data" };

/** Title words to search people by, 3–64 chars each, max 10 (b2bsearch rule). */
export function titleKeywords(title: string): string[] {
  const clean = title.replace(/\(.*?\)/g, " ").replace(/[|,]/g, " ").replace(/\s+/g, " ").trim();
  const words = clean.split(" ").filter((w) => w && !STOP.has(w.toLowerCase()));
  const base = words.join(" ");
  const out = new Set<string>();
  if (base.length >= 3) out.add(base);
  // "UI/UX Design" -> "UI/UX Designer"
  const last = words[words.length - 1]?.toLowerCase();
  if (last && ROLE_NOUN[last]) out.add([...words.slice(0, -1), ROLE_NOUN[last]].join(" "));
  for (let i = 0; i < words.length - 1; i++) out.add(`${words[i]} ${words[i + 1]}`);
  words.forEach((w) => { if (w.length >= 3) out.add(w); if (ROLE_NOUN[w.toLowerCase()]) out.add(ROLE_NOUN[w.toLowerCase()]); });
  return [...out].filter((w) => w.length >= 3 && w.length <= 64).slice(0, 10);
}

function monthsSince(d: any) {
  const t = d ? new Date(d.year ? `${d.year}-${String(d.month || 1).padStart(2, "0")}-01` : d).getTime() : NaN;
  return Number.isFinite(t) ? Math.max(0, Math.round((Date.now() - t) / (30.4 * 86400_000))) : undefined;
}

/** Keep only who they are at THIS company now; drop the rest of their history. */
function cleanPerson(r: any, i: number, company: string): Person | null {
  const name = str(r.fullName || r.name || [r.firstName, r.lastName].filter(Boolean).join(" "));
  if (!name) return null;
  const positions: any[] = Array.isArray(r.positions) ? r.positions : Array.isArray(r.experience) ? r.experience : [];
  const lc = company.toLowerCase();
  const current = positions.find((p) => !p.endDate && (!lc || str(p.companyName || p.company).toLowerCase().includes(lc.split(" ")[0]))) || positions[0];
  const past = positions
    .filter((p) => p !== current)
    .map((p) => str(p.companyName || p.company))
    .filter(Boolean)
    .slice(0, 5);
  const schools = (Array.isArray(r.education) ? r.education : []).map((e: any) => str(e.schoolName || e.school || e.title)).filter(Boolean).slice(0, 3);
  const skills = (Array.isArray(r.skills) ? r.skills : typeof r.skills === "string" ? r.skills.split(",") : [])
    .map((s: any) => str(s.name || s).trim())
    .filter(Boolean)
    .slice(0, 25);
  const email = r.employerMatch === true ? str(r.email || (Array.isArray(r.emails) && r.emails[0]?.email)) : "";
  return {
    id: "p" + i,
    name,
    first: name.split(" ")[0],
    title: str(r.title || current?.title || r.headline).slice(0, 90),
    months: monthsSince(current?.startDate || current?.start),
    active: r.lowSignal ? "Rarely active" : "Active",
    headline: str(r.headline).slice(0, 160) || undefined,
    about: str(r.about || r.summary || r.description).slice(0, 700) || undefined,
    schools,
    pastCompanies: past,
    skills,
    profileUrl: str(r.profileUrl || r.linkedinUrl || r.url) || undefined,
    email: email || undefined,
    emailFound: email ? /verified|valid|found/i.test(str(r.emailType || r.emails?.[0]?.status)) : undefined,
  };
}

/** People in a similar role: b2bsearch (domain) first, harvestapi (LinkedIn URL) as fallback. One run per company. */
export async function fetchPeople(company: CompanyData, jobTitle: string, mode: "full" | "lean", own?: string | null): Promise<Person[]> {
  const kw = titleKeywords(jobTitle);
  const want = mode === "full" ? 5 : 3;
  let rows: any[] = [];
  if (company.domain) {
    try {
      const { items, label } = await runActor<any>("b2bsearch/company-employees", {
        companies: [company.domain],
        profileDetail: mode === "full" ? "contacts" : "roster",
        titleContains: kw,
        maxRows: want,
        compact: true,
      }, { timeoutSec: 60, b2bRows: want, ownToken: own });
      rows = items.filter((r) => r._status === "found" || (!r._status && (r.fullName || r.name)));
      await addRows(label, rows.length);
    } catch (e) {
      console.warn("b2bsearch failed", e);
    }
  }
  if (!rows.length && company.linkedinUrl && mode === "full") {
    try {
      const { items } = await runActor<any>("harvestapi/linkedin-company-employees", {
        companies: [company.linkedinUrl],
        jobTitles: kw.slice(0, 5),
        profileScraperMode: "Full + email search ($12 per 1k)",
        maxItems: want,
      }, { timeoutSec: 240, ownToken: own });
      rows = items.map((r) => ({ ...r, employerMatch: true, email: Array.isArray(r.emails) ? r.emails.find((e: any) => /valid|verified/i.test(e.status))?.email : undefined, emailType: "verified" }));
    } catch (e) {
      console.warn("harvestapi failed", e);
    }
  }
  return rows
    .filter((r) => !r.lowSignal || rows.length <= 2)
    .map((r, i) => cleanPerson(r, i, company.name))
    .filter((p): p is Person => !!p);
}
