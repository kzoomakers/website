import { NextResponse } from "next/server";
import { clientIp } from "@/lib/comments";
import { access, isRes } from "@/lib/guest-access";
import { imageFail, uploadGate } from "@/lib/image";
import { storePhoto } from "@/lib/guests";

export const dynamic = "force-dynamic";

// POST multipart { kind, expires, file } (?g=<id> host, ?t=<token> guest): the guest's photo ID, encrypted. There is no GET: a host never sees a guest's government ID, only whether one is on file.
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
