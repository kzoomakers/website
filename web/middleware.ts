import { NextResponse, type NextRequest } from "next/server";
import { getSecHeaders } from "@/lib/sechead-store";
import { headersFor } from "@/lib/sechead";
import { uploadLimits } from "@/lib/upload-cfg";
import { publicTooLarge } from "@/lib/upload-limit";

// Node runtime (Postgres needs it): adds the security headers (Admin > Security headers) and refuses oversized requests. The HTTP log is written by lib/httplog-hook.ts, which sees the response code.
// The upload routes are left out on purpose: they check who you are first and then apply the (larger) signed-in limit themselves (lib/image.ts uploadGate). Everything else is behind this file,
// where Next.js buffers at most 10 MB of a body, so anonymous callers can never make the server hold more than that.
export const config = { runtime: "nodejs", matcher: ["/((?!_next/static|_next/image|favicon.ico|api/onboarding/id|api/members/photo|api/members/art|api/reviews|api/webmaster/upload).*)"] };

export async function middleware(req: NextRequest) {
  const len = Number(req.headers.get("content-length"));
  if (len > 0) { // before the body is read: the declared size is enough to say no
    const mb = (await uploadLimits()).publicMb;
    if (len > mb * 1024 * 1024) return new NextResponse(publicTooLarge(mb), { status: 413, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  const res = NextResponse.next();
  try {
    // Fly's proxy ends TLS, so HTTPS shows in x-forwarded-proto, not in the URL.
    const https = (req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "")) === "https";
    for (const [k, v] of Object.entries(headersFor(await getSecHeaders(), req.nextUrl.pathname, https))) res.headers.set(k, v);
  } catch { /* headers are best effort: never take a page down */ }
  return res;
}
