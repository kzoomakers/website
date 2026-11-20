import { NextResponse } from "next/server";
import { feedOrigin } from "@/feed/config";
import { csrfOk, originOk } from "@/feed/auth";
import { viewerFor } from "@/feed/identity";
import { putError } from "@/feed/flash";
import { deleteRequest, sendForRequest } from "@/feed/models/invitations";
import { hit } from "@/lib/limit";

export const dynamic = "force-dynamic";
const H = { "cache-control": "no-store", "referrer-policy": "no-referrer" };

// invitations#send_for_request and #delete_request. The model checks that this person may see the queue.
export async function POST(req: Request) {
  if (!originOk(req.headers)) return new NextResponse("forbidden", { status: 403 });
  const f = await req.formData().catch(() => null);
  if (!f) return new NextResponse("bad request", { status: 400 });
  const cookie = req.headers.get("cookie")?.match(/(?:^|;\s*)feed_session=([\w.-]{1,200})/)?.[1] ?? "";
  const v = await viewerFor(cookie);
  if (!v || !v.username || !csrfOk(cookie, String(f.get("csrf") ?? "").slice(0, 100))) return new NextResponse("forbidden", { status: 403 });
  const code = String(f.get("code") ?? "").slice(0, 60);
  try {
    if (f.get("do") === "send") {
      if (!(await hit(`feed:invite:${v.id}`, 20, 3_600_000, true))) putError(v.id, "You're sending invitations too fast. Please wait a bit.");
      else { const r = await sendForRequest(v.id, code); putError(v.id, r.ok ? `Invitation sent to ${r.name}.` : `Couldn't send the invitation: ${r.error}`, r.ok); }
    } else { const r = await deleteRequest(v.id, code); putError(v.id, r.ok ? "Request deleted." : r.error, r.ok); }
  } catch (e) { console.error("feed invitation request action:", e); putError(v.id, "Something went wrong. Please try again."); }
  return NextResponse.redirect(feedOrigin() + "/invitations/requests", { status: 303, headers: H });
}
