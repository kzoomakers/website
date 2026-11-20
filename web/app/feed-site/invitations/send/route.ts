import { NextResponse } from "next/server";
import { feedOrigin } from "@/feed/config";
import { csrfOk, originOk } from "@/feed/auth";
import { viewerFor } from "@/feed/identity";
import { putError } from "@/feed/flash";
import { createInvitation } from "@/feed/models/invitations";
import { hit } from "@/lib/limit";
import { clientIp } from "@/lib/comments";

export const dynamic = "force-dynamic";
const H = { "cache-control": "no-store", "referrer-policy": "no-referrer" };

// invitations#create. Limited per person and per address of origin, since each send mails a stranger.
export async function POST(req: Request) {
  if (!originOk(req.headers)) return new NextResponse("forbidden", { status: 403 });
  const f = await req.formData().catch(() => null);
  if (!f) return new NextResponse("bad request", { status: 400 });
  const cookie = req.headers.get("cookie")?.match(/(?:^|;\s*)feed_session=([\w.-]{1,200})/)?.[1] ?? "";
  const v = await viewerFor(cookie);
  if (!v || !v.username || !csrfOk(cookie, String(f.get("csrf") ?? "").slice(0, 100))) return new NextResponse("forbidden", { status: 403 });
  try {
    if (!(await hit(`feed:invite:${v.id}`, 20, 3_600_000, true)) || !(await hit(`feed:invite:ip:${clientIp(req)}`, 40, 3_600_000, true))) putError(v.id, "You're sending invitations too fast. Please wait a bit.");
    else {
      const r = await createInvitation(v.id, String(f.get("email") ?? "").slice(0, 300), String(f.get("memo") ?? "").slice(0, 1000));
      putError(v.id, r.ok ? `Invitation sent to ${r.email}.` : `Couldn't send the invitation: ${r.error}`, r.ok);
    }
  } catch (e) { console.error("feed invite:", e); putError(v.id, "Something went wrong. Please try again."); }
  return NextResponse.redirect(feedOrigin() + "/invitations", { status: 303, headers: H });
}
