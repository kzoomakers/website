import { NextResponse } from "next/server";
import { book, openSlots, requestTour, AREAS, HEARD, CONTACT } from "@/lib/tours";
import { baseUrl } from "@/lib/mail";
import { hashIp } from "@/lib/comments";

export const dynamic = "force-dynamic";
const fail = (e: any) => new NextResponse(e.message === "not configured" ? "Booking isn't available right now." : e.message, { status: 400 });

// GET: open tours in the next four weeks, plus the form's choices.
export async function GET() {
  try { return NextResponse.json({ slots: await openSlots(), areas: AREAS, heard: HEARD, contact: CONTACT }); } catch (e) { return fail(e); }
}

// POST { block, start, name, email, phone, areas?, heard?, notes?, website? }, or { request: true, first, last, email, phone, zip, contact, areas?, notes?, website? } when no time is open.
export async function POST(req: Request) {
  const b = await req.json().catch(() => null), s = (v: unknown) => (typeof v === "string" ? v : "");
  if (b?.request) {
    if (b.website) return NextResponse.json({ ok: true });
    try { await requestTour(b, hashIp(req), await baseUrl(req)); return NextResponse.json({ ok: true }); } catch (e: any) { return fail(e); }
  }
  if (!Number.isInteger(b?.block) || !s(b.start) || !s(b.name) || !s(b.email)) return new NextResponse("Please fill in your name, email and phone.", { status: 400 });
  if (b.website) return NextResponse.json({ ok: true }); // honeypot: pretend it worked
  try {
    return NextResponse.json(await book({ block: b.block, start: s(b.start), name: s(b.name), email: s(b.email), phone: s(b.phone), areas: Array.isArray(b.areas) ? b.areas.map(s) : [], heard: s(b.heard), notes: s(b.notes) }, hashIp(req), await baseUrl(req)));
  } catch (e: any) { return fail(e); }
}
