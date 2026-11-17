import { NextResponse } from "next/server";

// Android share sheet target (installed web app): hand the shared text to the home page's paste box.
export async function GET(req: Request) {
  const u = new URL(req.url);
  const shared = [u.searchParams.get("url"), u.searchParams.get("text"), u.searchParams.get("title")].filter(Boolean).join(" ");
  return NextResponse.redirect(new URL(`/?link=${encodeURIComponent(shared)}`, u.origin));
}
