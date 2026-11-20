import { NextResponse } from "next/server";
import { feedOrigin } from "@/feed/config";
import { originOk } from "@/feed/auth";
import { requestInvitation } from "@/feed/models/invitations";
import { hit } from "@/lib/limit";
import { clientIp } from "@/lib/comments";

export const dynamic = "force-dynamic";
const H = { "cache-control": "no-store", "referrer-policy": "no-referrer" };
const back = (q: string) => NextResponse.redirect(feedOrigin() + "/invitations/request" + q, { status: 303, headers: H });

// invitations#create_by_request. Open to anyone and it sends mail to the address given, so it is limited hard per visitor and per address.
export async function POST(req: Request) {
  if (!originOk(req.headers)) return new NextResponse("forbidden", { status: 403 });
  const f = await req.formData().catch(() => null);
  if (!f) return new NextResponse("bad request", { status: 400 });
  const s = (k: string, n: number) => String(f.get(k) ?? "").slice(0, n), ip = clientIp(req), email = s("email", 200).trim().toLowerCase();
  if (!(await hit(`feed:invreq:ip:${ip}`, 3, 3_600_000, true)) || !(await hit(`feed:invreq:addr:${email}`, 2, 86_400_000, true))) return back("?error=" + encodeURIComponent("Too many requests. Please try again later."));
  try {
    const r = await requestInvitation(ip, s("name", 300), email, s("memo", 400));
    return back(r.ok ? "?sent=1" : "?error=" + encodeURIComponent(r.error));
  } catch (e) { console.error("feed invitation request:", e); return back("?error=" + encodeURIComponent("Something went wrong. Please try again.")); }
}
