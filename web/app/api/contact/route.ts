import { NextResponse } from "next/server";
import { errMsg } from "@/lib/errmsg";
import { submitContact } from "@/lib/contact";
import { hashIp } from "@/lib/comments";

// POST { kind: "contact" | "board", name, email, subject?, message, website? }
export async function POST(req: Request) {
  const b = await req.json().catch(() => null), s = (v: unknown) => (typeof v === "string" ? v : "");
  if (!["contact", "board"].includes(b?.kind) || !s(b.name) || !s(b.email) || !s(b.message)) return new NextResponse("Please fill in your name, email and message.", { status: 400 });
  // Honeypot: hidden from people, filled by bots. Pretend it worked.
  if (b.website) return NextResponse.json({ ok: true });
  try {
    await submitContact(b.kind, { name: s(b.name), email: s(b.email), subject: s(b.subject), message: s(b.message) }, hashIp(req));
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return new NextResponse(e.message === "not configured" ? "The form isn't available right now." : errMsg(e), { status: 400 });
  }
}
