import { NextResponse } from "next/server";
import { feedOrigin } from "@/feed/config";
import { SESSION_COOKIE, SESSION_DAYS, cookieOpts, csrfOk, originOk } from "@/feed/auth";
import { putError } from "@/feed/flash";
import { sendVerifyLink, startSession, viewerFor } from "@/feed/identity";
import { BOOLS, saveSettings } from "@/feed/models/settings";

export const dynamic = "force-dynamic";
const H = { "cache-control": "no-store", "referrer-policy": "no-referrer" };

// settings#update. Any signed-in person, for their own row only (the id comes from the session, never the form).
export async function POST(req: Request) {
  if (!originOk(req.headers)) return new NextResponse("forbidden", { status: 403 });
  const f = await req.formData().catch(() => null);
  if (!f) return new NextResponse("bad request", { status: 400 });
  const cookie = req.headers.get("cookie")?.match(/(?:^|;\s*)feed_session=([\w.-]{1,200})/)?.[1] ?? "";
  const v = await viewerFor(cookie);
  if (!v || !csrfOk(cookie, String(f.get("csrf") ?? "").slice(0, 100))) return new NextResponse("forbidden", { status: 403 });
  const s = (k: string, max = 300) => String(f.get(k) ?? "").slice(0, max);
  let session: string | undefined;
  try {
    const r = await saveSettings(v.id, {
      username: s("username", 60), email: s("email", 200), homepage: s("homepage", 400), about: s("about", 25_000), show_email: f.get("show_email") === "1",
      scheme: s("prefers_color_scheme", 20), contrast: s("prefers_contrast", 20), bools: Object.fromEntries(BOOLS.map((k) => [k, f.get(k) === "1"])) as Record<(typeof BOOLS)[number], boolean>,
      currentPassword: s("current_password", 201), password: s("password", 201), confirm: s("password_confirmation", 201),
    });
    if (!r.ok) putError(v.id, `Settings not saved: ${r.error}.`);
    else {
      putError(v.id, r.verify ? "Settings saved. Check your new address for a confirmation link." : "Successfully updated settings.", true);
      if (r.verify) await sendVerifyLink(v.id, r.verify).catch((e) => console.error("feed verify mail:", e));
      if (r.newPassword) session = await startSession(v.id); // the new password ended every other session; this one carries on
    }
  } catch (e) { console.error("feed settings:", e); putError(v.id, "Something went wrong. Please try again."); }
  const res = NextResponse.redirect(feedOrigin() + "/settings", { status: 303, headers: H });
  if (session) res.cookies.set(SESSION_COOKIE, session, cookieOpts(SESSION_DAYS * 86400));
  return res;
}
