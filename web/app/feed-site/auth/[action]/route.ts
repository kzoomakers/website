import { NextResponse } from "next/server";
import { feedOrigin } from "@/feed/config";
import { SESSION_COOKIE, SESSION_DAYS, cookieOpts, csrfOk, originOk, safeReturn } from "@/feed/auth";
import { Refused, chooseUsername, forgotPassword, logoutEverywhere, passwordLogin, register, resendVerification, setNewPassword, viewerFor } from "@/feed/identity";

export const dynamic = "force-dynamic";

// Every account form on the community site posts here. Order of business: same-site check first, then the action. Pages only ever show messages from a fixed list chosen by these short codes.
const H = { "cache-control": "no-store", "referrer-policy": "no-referrer" };
const to = (path: string, session?: string) => {
  const r = NextResponse.redirect(feedOrigin() + path, { status: 303, headers: H });
  if (session !== undefined) r.cookies.set(SESSION_COOKIE, session, cookieOpts(session ? SESSION_DAYS * 86400 : 0));
  return r;
};
const q = (o: Record<string, string>) => "?" + new URLSearchParams(o);

export async function POST(req: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  if (!originOk(req.headers)) return new NextResponse("forbidden", { status: 403 });
  const f = await req.formData().catch(() => null);
  if (!f) return new NextResponse("bad request", { status: 400 });
  const str = (k: string, max = 300) => { const v = f.get(k); return typeof v === "string" ? v.slice(0, max) : ""; };
  const ret = safeReturn(str("return", 200)), cookie = req.headers.get("cookie")?.match(/(?:^|;\s*)feed_session=([\w.-]{1,200})/)?.[1] ?? "";
  const here = (e: string, extra: Record<string, string> = {}) => ({ login: "/login", signup: "/signup", forgot: "/login/forgot_password", reset: "/login/set_new_password", username: "/login/username" } as Record<string, string>)[action] + q({ ...extra, e });
  try {
    if (action === "login") return to(ret, await passwordLogin(req, str("email"), str("password", 201)));
    if (action === "signup") { await register(req, { email: str("email"), password: str("password", 201), code: str("code", 60) }); return to("/login?n=verify_sent"); }
    if (action === "forgot") { await forgotPassword(req, str("email")); return to("/login?n=reset_sent"); } // same answer whether or not the address has an account
    if (action === "reset") return to("/", await setNewPassword(str("t", 100), str("password", 201)));
    // The rest need a signed-in person and the token that went out with the form
    const v = await viewerFor(cookie);
    if (!v || !csrfOk(cookie, str("csrf", 100))) return new NextResponse("forbidden", { status: 403 });
    if (action === "logout") { await logoutEverywhere(v.id); return to("/login?n=logged_out", ""); }
    if (action === "resend") { await resendVerification(req, v); return to("/"); }
    if (action === "username") { await chooseUsername(v.id, str("username", 40)); return to(ret); }
    return new NextResponse("not found", { status: 404 });
  } catch (e) {
    if (e instanceof Refused) return to(here(e.code, action === "reset" ? { t: str("t", 100) } : action === "login" ? { return: ret } : {}));
    console.error("feed auth:", action, e);
    return to(here("error"));
  }
}
