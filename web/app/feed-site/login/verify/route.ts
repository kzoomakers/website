import { NextResponse } from "next/server";
import { feedOrigin } from "@/feed/config";
import { verifyEmail } from "@/feed/identity";

export const dynamic = "force-dynamic";

// The link in the confirmation email. Opening it changes nothing but marking the address confirmed, so a mail scanner opening it early does no harm.
export async function GET(req: Request) {
  const ok = await verifyEmail(new URL(req.url).searchParams.get("t") ?? "").catch(() => false);
  return NextResponse.redirect(feedOrigin() + (ok ? "/login?n=verified" : "/login?e=link_bad"), { status: 302, headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } });
}
