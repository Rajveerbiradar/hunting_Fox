import { NextResponse } from "next/server";
import { userClient } from "@/lib/supabase/clients";

// Google sign-in returns here. `next` carries the pasted link back to the home page.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/";
  if (code) {
    const sb = await userClient();
    await sb.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(new URL(next.startsWith("/") ? next : "/", url.origin));
}
