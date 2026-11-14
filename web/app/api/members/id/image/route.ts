import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { UNLOCK_COOKIE, currentMember, idUnlocked } from "@/lib/readers";
import { myImage } from "@/lib/id-card";

export const dynamic = "force-dynamic";

// GET: the member's own ID picture, only while the card is unlocked (password or emailed link, ten minutes).
export async function GET() {
  const u = await currentMember().catch(() => null);
  if (!u || !idUnlocked(u.id, (await cookies()).get(UNLOCK_COOKIE)?.value)) return new NextResponse("locked", { status: 403 });
  const img = await myImage(u.id);
  return img ? new NextResponse(new Uint8Array(img), { headers: { "content-type": "image/webp", "cache-control": "private, no-store", "x-content-type-options": "nosniff" } }) : new NextResponse("none", { status: 404 });
}
