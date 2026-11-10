import { NextResponse } from "next/server";
import { fullPrivacy } from "@/lib/ga-privacy";

// Public: the same text as the Privacy page, for the cookie notice to show inline.
export const dynamic = "force-dynamic";

export async function GET() {
  try { return NextResponse.json({ text: await fullPrivacy() }, { headers: { "cache-control": "public, max-age=300" } }); }
  catch { return new NextResponse("unavailable", { status: 503 }); }
}
