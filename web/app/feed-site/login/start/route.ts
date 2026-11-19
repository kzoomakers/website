import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { mainOrigin } from "@/feed/config";
import { cookieOpts, safeReturn } from "@/feed/auth";

export const dynamic = "force-dynamic";

// "Log in as a member / admin": remember a random value in this browser, then ask the main site to vouch for the visitor. The token that comes back only works here if it carries the same value.
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams, role = q.get("role");
  if (role !== "member" && role !== "admin") return new NextResponse("bad request", { status: 400 });
  const state = randomBytes(24).toString("base64url");
  const to = `${mainOrigin()}/feed-sso?${new URLSearchParams({ role, state, return: safeReturn(q.get("return")) })}`;
  const res = NextResponse.redirect(to, { status: 302, headers: { "cache-control": "no-store" } });
  res.cookies.set("feed_hs", state, { ...cookieOpts(600), path: "/login/handoff" });
  return res;
}
