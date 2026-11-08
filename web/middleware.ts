import { NextResponse, type NextRequest } from "next/server";
import { getSecHeaders } from "@/lib/sechead-store";
import { headersFor } from "@/lib/sechead";

// Node runtime (Postgres needs it): adds the security headers (Admin > Security headers). The HTTP log is written by lib/httplog-hook.ts, which sees the response code.
export const config = { runtime: "nodejs", matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  try {
    // Fly's proxy ends TLS, so HTTPS shows in x-forwarded-proto, not in the URL.
    const https = (req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "")) === "https";
    for (const [k, v] of Object.entries(headersFor(await getSecHeaders(), req.nextUrl.pathname, https))) res.headers.set(k, v);
  } catch { /* headers are best effort: never take a page down */ }
  return res;
}
