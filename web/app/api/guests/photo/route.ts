import { NextResponse } from "next/server";
import { clientIp } from "@/lib/comments";
import { access, isRes } from "@/lib/guest-access";
import { imageFail, uploadGate } from "@/lib/image";
import { photoOf, storePhoto } from "@/lib/guests";

export const dynamic = "force-dynamic";

// POST multipart { kind, expires, file } (?g=<id> host, ?t=<token> guest): the guest's photo ID, encrypted. GET ?g=<id> (host only): the picture, shown beside their name at check-in.
export async function POST(req: Request) {
  const a = await access(req);
  if (isRes(a)) return a;
  const bad = await uploadGate(req, a.host ? String(a.hostId) : "guest:" + clientIp(req));
  if (bad) return bad;
  const f = await req.formData().catch(() => null), file = f?.get("file");
  if (!f || !(file instanceof File)) return new NextResponse("Choose a photo or scan of the ID.", { status: 400 });
  try {
    await storePhoto(a.g.id, String(f.get("kind") ?? ""), String(f.get("expires") ?? ""), file);
    return NextResponse.json({ ok: true });
  } catch (e: any) { return imageFail(e); }
}

export async function GET(req: Request) {
  const a = await access(req);
  if (isRes(a) || !a.host) return isRes(a) ? a : new NextResponse("not found", { status: 404 });
  const img = await photoOf(a.g.id);
  return img ? new NextResponse(new Uint8Array(img), { headers: { "content-type": "image/webp", "cache-control": "private, no-store", "x-content-type-options": "nosniff" } }) : new NextResponse("none", { status: 404 });
}
