export type JobData = {
  title: string;
  company: string;
  location?: string;
  description: string;
  keySkills: string[];
  postedText?: string;
  applicantsText?: string;
  jobState?: string;
  applyUrl?: string;
  poster?: { name?: string; title?: string; url?: string; worksThere?: boolean };
  hiringEmail?: string;
  consultant?: boolean;
};

export type CompanyData = {
  name: string;
  website?: string;
  domain?: string;
  linkedinUrl?: string;
  sizeText?: string;
  sizeMin?: number;
  founded?: number;
  industry?: string;
  hq?: string;
  rating?: number;
  reviews?: number;
};

export type Check = { group: "The company" | "Who posted the job" | "The people we found"; text: string; result: "pass" | "warn" | "unknown" };

export type Person = {
  id: string;
  name: string;
  first: string;
  title: string;
  months?: number;
  active: "Active" | "Rarely active";
  headline?: string;
  about?: string;
  schools: string[];
  pastCompanies: string[];
  skills: string[];
  profileUrl?: string;
  email?: string;
  emailFound?: boolean; // true = provider verified, false = pattern guess
  why?: string;
  link?: { type: string; detail: string } | null;
  line?: string;
  note?: string;
  subject?: string;
  body?: string;
  written?: boolean;
  /** The rough lines the student wrote for this person's message, if they wrote any. */
  asked?: string;
};

export type ResumePart = {
  base_lines: string[];
  /** `group` ties several edits to one keep/drop decision (the summary and the lines folded into it). */
  edits: { old: string; new: string; reason: string; group?: string }[];
  skill_questions: { skill: string; why: string }[];
  suggestions: { title: string; why: string }[];
  /** The job's exact screening words and whether this copy of the resume has each one. */
  keywords?: { term: string; in_resume: boolean }[];
  /** No summary section in the resume: this one is added after the contact line. */
  summary_insert?: { text: string; reason: string };
  /** v2: changes are suggestions until the student applies them. */
  v?: 2;
  applied?: boolean;
  applied_at?: string;
  /** Edit index (or "s" for the inserted summary) → kept (true) or dropped (false). Missing = kept. */
  decisions?: Record<string, boolean>;
  /** What this job really wants, and the student's proof for each. */
  priorities?: { need: string; proof: string; strength: "strong" | "weak" | "none" }[];
  /** Questions about experience the resume doesn't show yet. Answers are saved on profiles.facts. */
  gaps?: { id: string; question: string; why: string }[];
  /** The AI couldn't write the changes (why, short). The page offers "Try again". */
  failed?: string;
};

export type ResumeProfile = {
  name?: string | null;
  headline?: string;
  skills?: string[];
  projects?: { title: string; detail: string }[];
  education?: { school: string; what: string; from?: string | null; to?: string | null }[];
  lines?: string[];
  /** What a resume normally has that this one lacks (shown once after upload). */
  missing?: string[];
};
