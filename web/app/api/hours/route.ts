import { NextResponse } from "next/server";
import { getHours } from "@/lib/store";

export const dynamic = "force-dynamic";

// Public: read by dynamic/js/hours.js on every page.
export async function GET() {
  return NextResponse.json(await getHours());
}
