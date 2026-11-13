import { NextResponse } from "next/server";
import { mailEvent } from "@/lib/tours";
import { baseUrl } from "@/lib/mail";

export const dynamic = "force-dynamic";

// A tracked link in a tour email: record the click, then send them on to the same page on our site. Only paths under /tours/ are followed, so this can't be used as an open redirect.
export async function GET(req: Request) {
  const u = new URL(req.url), p = u.searchParams.get("p") ?? "", base = await baseUrl(req);
  if (!/^\/tours\/[^\\\s]*$/.test(p)) return NextResponse.redirect(`${base}/tours`);
  await mailEvent(u.searchParams.get("m") ?? "", "click", req.headers.get("user-agent") ?? "", p).catch(() => {});
  return NextResponse.redirect(base + p);
}
