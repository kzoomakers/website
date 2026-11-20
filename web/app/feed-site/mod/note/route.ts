import { NextResponse } from "next/server";
import { feedOrigin } from "@/feed/config";
import { csrfOk, originOk } from "@/feed/auth";
import { viewerFor } from "@/feed/identity";
import { putError } from "@/feed/flash";
import { addModNote } from "@/feed/models/mod-notes";

export const dynamic = "force-dynamic";
const H = { "cache-control": "no-store", "referrer-policy": "no-referrer" };

// mod/notes#create. Singular path: Lobsters' legacy GET /mod/notes is redirected by feed/rewrite.ts, and a redirect would turn this POST into a GET. Moderators only; the model checks.
export async function POST(req: Request) {
  if (!originOk(req.headers)) return new NextResponse("forbidden", { status: 403 });
  const f = await req.formData().catch(() => null);
  if (!f) return new NextResponse("bad request", { status: 400 });
  const cookie = req.headers.get("cookie")?.match(/(?:^|;\s*)feed_session=([\w.-]{1,200})/)?.[1] ?? "";
  const v = await viewerFor(cookie);
  if (!v || !v.username || !csrfOk(cookie, String(f.get("csrf") ?? "").slice(0, 100))) return new NextResponse("forbidden", { status: 403 });
  const name = String(f.get("username") ?? "").slice(0, 60);
  try {
    const r = await addModNote(v, name, String(f.get("note") ?? "").slice(0, 70_000));
    if (!r.ok) putError(v.id, `Couldn't add the note: ${r.error}.`);
  } catch (e) { console.error("feed mod note:", e); putError(v.id, "Something went wrong. Please try again."); }
  return NextResponse.redirect(feedOrigin() + `/~${encodeURIComponent(name)}`, { status: 303, headers: H });
}
