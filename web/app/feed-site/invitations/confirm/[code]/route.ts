import { NextResponse } from "next/server";
import { feedOrigin } from "@/feed/config";
import { confirmRequest } from "@/feed/models/invitations";

export const dynamic = "force-dynamic";

// invitations#confirm_email: the link in the confirmation email. Repeating it is harmless.
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const ok = await confirmRequest((await params).code).catch(() => false);
  return NextResponse.redirect(feedOrigin() + (ok ? "/invitations/request?confirmed=1" : "/invitations/request?error=" + encodeURIComponent("Invalid or expired invitation request.")), { status: 303, headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } });
}
