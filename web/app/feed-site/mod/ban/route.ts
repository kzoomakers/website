import { NextResponse } from "next/server";
import { feedOrigin } from "@/feed/config";
import { csrfOk, originOk } from "@/feed/auth";
import { viewerFor } from "@/feed/identity";
import { putError } from "@/feed/flash";
import { modToggleBan } from "@/feed/models/mod";

export const dynamic = "force-dynamic";
const H = { "cache-control": "no-store", "referrer-policy": "no-referrer" };

// domains_ban#update and origins_ban#update: toggles the ban on a domain or origin (creating it if no story used it yet). Moderators only; the model checks.
export async function POST(req: Request) {
  if (!originOk(req.headers)) return new NextResponse("forbidden", { status: 403 });
  const f = await req.formData().catch(() => null);
  if (!f) return new NextResponse("bad request", { status: 400 });
  const cookie = req.headers.get("cookie")?.match(/(?:^|;\s*)feed_session=([\w.-]{1,200})/)?.[1] ?? "";
  const v = await viewerFor(cookie);
  if (!v || !v.username || !csrfOk(cookie, String(f.get("csrf") ?? "").slice(0, 100))) return new NextResponse("forbidden", { status: 403 });
  const kind = f.get("kind") === "origin" ? "origin" : "domain", name = String(f.get("name") ?? "").slice(0, 300);
  const back = feedOrigin() + `/${kind}s/${encodeURI(name.trim().toLowerCase())}`;
  try {
    const r = await modToggleBan(v, kind, name, String(f.get("reason") ?? ""));
    if (!r.ok) putError(v.id, `Couldn't do that: ${r.error}.`);
  } catch (e) { console.error("feed ban:", e); putError(v.id, "Something went wrong. Please try again."); }
  return NextResponse.redirect(back, { status: 303, headers: H });
}
