import { NextResponse } from "next/server";
import { captchaCfg } from "@/lib/captcha";

export const dynamic = "force-dynamic";

// The public site key the form widget needs ("" while the feature is off). The secret is never returned.
export async function GET() {
  return NextResponse.json({ site: (await captchaCfg())?.site ?? "" });
}
