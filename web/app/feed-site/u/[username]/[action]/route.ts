import { NextResponse } from "next/server";
import { feedOrigin } from "@/feed/config";
import { csrfOk, originOk } from "@/feed/auth";
import { viewerFor } from "@/feed/identity";
import { putError } from "@/feed/flash";
import { modBanUser, modSetInvites, modUnbanUser } from "@/feed/models/mod-users";

export const dynamic = "force-dynamic";
const H = { "cache-control": "no-store", "referrer-policy": "no-referrer" };

// users#ban and #unban (POST /~name/ban, /~name/unban). Moderators only; the model checks.
export async function POST(req: Request, { params }: { params: Promise<{ username: string; action: string }> }) {
  const { username, action } = await params;
  if (!["ban", "unban", "disable_invitation", "enable_invitation"].includes(action)) return new NextResponse("not found", { status: 404 });
  if (!originOk(req.headers)) return new NextResponse("forbidden", { status: 403 });
  const f = await req.formData().catch(() => null);
  if (!f) return new NextResponse("bad request", { status: 400 });
  const cookie = req.headers.get("cookie")?.match(/(?:^|;\s*)feed_session=([\w.-]{1,200})/)?.[1] ?? "";
  const v = await viewerFor(cookie);
  if (!v || !v.username || !csrfOk(cookie, String(f.get("csrf") ?? "").slice(0, 100))) return new NextResponse("forbidden", { status: 403 });
  const name = decodeURIComponent(username).slice(0, 60), reason = String(f.get("reason") ?? "");
  try {
    const r = action === "ban" ? await modBanUser(v, name, reason) : action === "unban" ? await modUnbanUser(v, name, reason) : await modSetInvites(v, name, action === "disable_invitation", reason);
    if (!r.ok) putError(v.id, `Couldn't do that: ${r.error}.`);
  } catch (e) { console.error("feed user ban:", e); putError(v.id, "Something went wrong. Please try again."); }
  return NextResponse.redirect(feedOrigin() + `/~${encodeURIComponent(name)}`, { status: 303, headers: H });
}
