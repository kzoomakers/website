import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { toRow, record } from "@/lib/httplog";
import { COOKIE_NAME, cookieUserId } from "@/lib/readers";

// Node runtime (Postgres needs it): logs every request except static assets to the HTTP log (Admin > Services > HTTP log). Never blocks or alters the request.
export const config = { runtime: "nodejs", matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };

const GOOGLE = ["__Secure-authjs.session-token", "authjs.session-token"];

export async function middleware(req: NextRequest) {
  try {
    const row = toRow(req);
    const site = cookieUserId(req.cookies.get(COOKIE_NAME)?.value);
    if (site) row.user = `site:${site}`; // resolved to the account's email when the batch is written
    const secure = GOOGLE.find((n) => req.cookies.has(n));
    if (secure && process.env.AUTH_SECRET) {
      const t = await getToken({ req, secret: process.env.AUTH_SECRET, secureCookie: secure.startsWith("__Secure-"), salt: secure }).catch(() => null);
      if (t?.email) row.user = `google:${t.email}`;
    }
    record(row);
  } catch { /* logging must never break a page */ }
  return NextResponse.next();
}
