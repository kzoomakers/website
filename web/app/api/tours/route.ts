import { NextResponse } from "next/server";
import { verifyCaptcha } from "@/lib/captcha";
import { errMsg } from "@/lib/errmsg";
import { book, getPause, openSlots, requestTour, AREAS, HEARD, CONTACT } from "@/lib/tours";
import { baseUrl } from "@/lib/mail";
import { clientIp, hashIp } from "@/lib/comments";
import { convert } from "@/lib/ga-attr";

export const dynamic = "force-dynamic";
const fail = (e: any) => new NextResponse(e.message === "not configured" ? "Booking isn't available right now." : errMsg(e), { status: 400 });

// GET: open tours in the next four weeks, plus the form's choices.
export async function GET() {
  try { const pause = await getPause(); return NextResponse.json({ pause: pause.paused ? pause.message : null, slots: pause.paused ? [] : await openSlots(), areas: AREAS, heard: HEARD, contact: CONTACT }); } catch (e) { return fail(e); }
}

// POST { block, start, first, last, email, phone, zip, contact, areas?, heard?, notes?, website? }, or the same without block/start plus request: true when no time is open.
export async function POST(req: Request) {
  const b = await req.json().catch(() => null), s = (v: unknown) => (typeof v === "string" ? v : "");
  // Kept so staff can spot abuse and follow up; the booking and request forms say so.
  const dev = { ip: clientIp(req).slice(0, 64), ua: (req.headers.get("user-agent") ?? "").slice(0, 300), screen: /^\d{3,5}x\d{3,5}$/.test(s(b?.screen)) ? s(b.screen) : "" };
  if (b?.request) {
    if (b.website) return NextResponse.json({ ok: true });
    try { await verifyCaptcha(req, b.captcha); await requestTour(b, hashIp(req), dev, await baseUrl(req)); await convert(req, "tour"); return NextResponse.json({ ok: true }); } catch (e: any) { return fail(e); }
  }
  if (!Number.isInteger(b?.block) || !s(b.start) || !s(b.first) || !s(b.last) || !s(b.email)) return new NextResponse("Please fill in your name, email and phone.", { status: 400 });
  if (b.website) return NextResponse.json({ ok: true }); // honeypot: pretend it worked
  try {
    await verifyCaptcha(req, b.captcha);
    const done = await book({ block: b.block, start: s(b.start), first: s(b.first), last: s(b.last), email: s(b.email), phone: s(b.phone), zip: s(b.zip), contact: s(b.contact), areas: Array.isArray(b.areas) ? b.areas.map(s) : [], heard: s(b.heard), notes: s(b.notes) }, hashIp(req), dev, await baseUrl(req));
    await convert(req, "tour");
    return NextResponse.json(done);
  } catch (e: any) { return fail(e); }
}
