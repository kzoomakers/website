import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { toRow, record } from "@/lib/httplog";
import { getSecHeaders } from "@/lib/sechead-store";
import { headersFor } from "@/lib/sechead";
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
  const res = NextResponse.next();
  try {
    // Fly's proxy ends TLS, so HTTPS shows in x-forwarded-proto, not in the URL.
    const https = (req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "")) === "https";
    for (const [k, v] of Object.entries(headersFor(await getSecHeaders(), req.nextUrl.pathname, https))) res.headers.set(k, v);
  } catch { /* headers are best effort: never take a page down */ }
  return res;
}
