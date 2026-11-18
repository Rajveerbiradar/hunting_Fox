/* eslint-disable @typescript-eslint/no-explicit-any */
import { adminClient } from "@/lib/supabase/clients";

/** Turn "linkedin.com/in/ananya-k/" or an email into the part we match on. */
export function contactKey(c: string) {
  const s = c.trim().toLowerCase();
  const li = s.match(/linkedin\.com\/in\/([^/?#\s]+)/);
  return li ? `linkedin.com/in/${li[1]}` : s;
}

export function matchesPerson(p: any, key: string) {
  const url = String(p?.profileUrl || "").toLowerCase();
  const email = String(p?.email || "").toLowerCase();
  return (key.includes("linkedin.com/in/") && url.includes(key)) || (!!email && email === key);
}

/** Drop anyone who asked to be removed. */
export async function withoutBlocked<T>(people: T[]): Promise<T[]> {
  if (!people.length) return people;
  const { data } = await adminClient().from("blocked_people").select("contact");
  const keys = (data || []).map((r) => r.contact);
  return keys.length ? people.filter((p) => !keys.some((k) => matchesPerson(p, k))) : people;
}
