import { NextResponse } from "next/server";
import { feedOrigin } from "@/feed/config";
import { csrfOk, originOk } from "@/feed/auth";
import { viewerFor } from "@/feed/identity";
import { putError } from "@/feed/flash";
import { createModMail, updateModMail } from "@/feed/models/mod-mail";

export const dynamic = "force-dynamic";
const H = { "cache-control": "no-store", "referrer-policy": "no-referrer" };

// mod/mails#create and #update. Moderators only; the model checks.
export async function POST(req: Request) {
  if (!originOk(req.headers)) return new NextResponse("forbidden", { status: 403 });
  const f = await req.formData().catch(() => null);
  if (!f) return new NextResponse("bad request", { status: 400 });
  const cookie = req.headers.get("cookie")?.match(/(?:^|;\s*)feed_session=([\w.-]{1,200})/)?.[1] ?? "";
  const v = await viewerFor(cookie);
  if (!v || !v.username || !csrfOk(cookie, String(f.get("csrf") ?? "").slice(0, 100))) return new NextResponse("forbidden", { status: 403 });
  const s = (k: string, n: number) => String(f.get(k) ?? "").slice(0, n);
  const id = s("id", 10), input = { subject: s("subject", 400), recipients: s("recipients", 2000), commentRefs: s("comment_refs", 2000), storyRefs: s("story_refs", 2000) };
  if (id && !/^[a-z0-9]{1,10}$/.test(id)) return new NextResponse("not found", { status: 404 });
  const form = feedOrigin() + (id ? `/mod/mails/${id}/edit` : "/mod/mails/new");
  try {
    const r = id ? await updateModMail(v, id, input) : await createModMail(v, input);
    if (r.ok) return NextResponse.redirect(feedOrigin() + `/mod/mails/${"shortId" in r ? r.shortId : id}`, { status: 303, headers: H });
    putError(v.id, `Mod mail not saved: ${r.errors.join(", ")}.`);
  } catch (e) { console.error("feed modmail save:", e); putError(v.id, "Something went wrong. Please try again."); }
  return NextResponse.redirect(form, { status: 303, headers: H });
}
