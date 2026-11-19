import { NextResponse } from "next/server";
import { hasAny, me } from "@/lib/guard";
import { PiiError, retrieve } from "@/lib/pii";

export const dynamic = "force-dynamic";

// POST { kind, subject: { type, id, renewal?, side?, doc? }, reason, note }: the only way staff read someone's personal information. Everything is checked and logged in lib/pii.ts.
export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  if (!b) return new NextResponse("bad request", { status: 400 });
  // No API key can retrieve PII: `me()` only reads the signed-in session, never an Authorization header.
  if (!hasAny(await me(), "crm")) return new NextResponse("not found", { status: 404 });
  try { return NextResponse.json(await retrieve(req, b.kind, b.subject, b.reason, b.note), { headers: { "cache-control": "no-store" } }); }
  catch (e: any) {
    if (!(e instanceof PiiError)) console.error("pii retrieve:", e);
    return new NextResponse(e instanceof PiiError ? e.message : "Something went wrong, and nothing was shown.", { status: e instanceof PiiError ? e.status : 500 });
  }
}
