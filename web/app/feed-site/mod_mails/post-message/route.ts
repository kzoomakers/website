import { NextResponse } from "next/server";
import { feedOrigin } from "@/feed/config";
import { csrfOk, originOk } from "@/feed/auth";
import { viewerFor } from "@/feed/identity";
import { putError } from "@/feed/flash";
import { sendModMailMessage } from "@/feed/models/mod-mail";
import { hit } from "@/lib/limit";

export const dynamic = "force-dynamic";
const H = { "cache-control": "no-store", "referrer-policy": "no-referrer" };

// mod_mail_messages#create (and mod/mail_messages#create): one message to a mail you are a recipient of, or any mail if you moderate.
export async function POST(req: Request) {
  if (!originOk(req.headers)) return new NextResponse("forbidden", { status: 403 });
  const f = await req.formData().catch(() => null);
  if (!f) return new NextResponse("bad request", { status: 400 });
  const cookie = req.headers.get("cookie")?.match(/(?:^|;\s*)feed_session=([\w.-]{1,200})/)?.[1] ?? "";
  const v = await viewerFor(cookie);
  if (!v || !v.username || !csrfOk(cookie, String(f.get("csrf") ?? "").slice(0, 100))) return new NextResponse("forbidden", { status: 403 });
  const id = String(f.get("id") ?? "").slice(0, 10);
  if (!/^[a-z0-9]{1,10}$/.test(id)) return new NextResponse("not found", { status: 404 });
  const back = feedOrigin() + (v.isModerator ? `/mod/mails/${id}` : `/mod_mails/${id}`);
  try {
    if (!(await hit(`feed:modmail:${v.id}`, 30, 3_600_000, true))) putError(v.id, "You're sending messages too fast. Please wait a bit.");
    else {
      const r = await sendModMailMessage(v, id, String(f.get("message") ?? "").slice(0, 20_000));
      if (!r.ok) putError(v.id, `Your message failed: ${r.errors.join(", ")}.`);
    }
  } catch (e) { console.error("feed modmail:", e); putError(v.id, "Something went wrong. Please try again."); }
  return NextResponse.redirect(back, { status: 303, headers: H });
}
