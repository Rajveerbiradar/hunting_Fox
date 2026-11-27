import { NextResponse } from "next/server";
import { adminClient, currentUser } from "@/lib/supabase/clients";

export const dynamic = "force-dynamic";

/** The signed-in student's main resume as lines, for "Download my resume" (PDF is made in the browser). */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  const { data: p } = await adminClient().from("profiles").select("name,resume_text").eq("id", user.id).maybeSingle();
  const lines = String(p?.resume_text || "").split("\n").filter((l) => l.trim());
  const top = lines.find((l) => l.startsWith("# "));
  return NextResponse.json({ lines, name: top ? top.slice(2).trim() : p?.name || "" });
}
