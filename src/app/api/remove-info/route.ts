import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/clients";

export async function POST(req: Request) {
  const { contact } = await req.json().catch(() => ({ contact: "" }));
  const c = String(contact || "").trim().slice(0, 200);
  if (c.length < 5) return NextResponse.json({ error: "empty" }, { status: 400 });
  await adminClient().from("removal_requests").insert({ contact: c });
  return NextResponse.json({ ok: true });
}
