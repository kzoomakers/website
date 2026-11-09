import { NextResponse } from "next/server";
import { publicTag } from "@/lib/ga";

// Public: the Measurement ID is already visible in any page that loads the tag. Cached for a minute (matches the in-memory copy in publicTag) so page views don't hit the database.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await publicTag(), { headers: { "cache-control": "public, max-age=60" } });
}
