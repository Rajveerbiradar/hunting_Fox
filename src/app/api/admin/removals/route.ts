/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/clients";
import { requireAdmin } from "@/lib/admin";
import { contactKey, matchesPerson as matches } from "@/lib/removals";

/** Saved jobs and cached companies that show this person. */
async function whereShown(key: string) {
  const sb = adminClient();
  const [{ data: reports }, { data: caches }] = await Promise.all([
    sb.from("reports").select("job_id,people").not("people", "is", null),
    sb.from("company_cache").select("key,people").not("people", "is", null),
  ]);
  return {
    reports: (reports || []).filter((r) => Array.isArray(r.people) && r.people.some((p: any) => matches(p, key))),
    caches: (caches || []).filter((c) => Array.isArray(c.people) && c.people.some((p: any) => matches(p, key))),
  };
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { data } = await adminClient().from("removal_requests").select("*").order("created_at", { ascending: false }).limit(300);
  const rows = await Promise.all((data || []).map(async (r) => {
    const found = r.removed_at ? r.found_in : (await whereShown(contactKey(r.contact))).reports.length;
    return { ...r, found };
  }));
  return NextResponse.json({ requests: rows });
}

/** Mark as removed: delete them from every saved people list and block them from future scans. */
export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await req.json().catch(() => ({ id: 0 }));
  const sb = adminClient();
  const { data: r } = await sb.from("removal_requests").select("*").eq("id", id).maybeSingle();
  if (!r) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const key = contactKey(r.contact);
  const shown = await whereShown(key);
  await Promise.all([
    ...shown.reports.map((x) => sb.from("reports").update({ people: x.people.filter((p: any) => !matches(p, key)) }).eq("job_id", x.job_id)),
    ...shown.caches.map((x) => sb.from("company_cache").update({ people: x.people.filter((p: any) => !matches(p, key)), ranking: null }).eq("key", x.key)),
    sb.from("blocked_people").upsert({ contact: key }),
  ]);
  await sb.from("removal_requests").update({ removed_at: new Date().toISOString(), found_in: shown.reports.length }).eq("id", id);
  return NextResponse.json({ ok: true, removedFrom: shown.reports.length });
}
