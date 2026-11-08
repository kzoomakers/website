import { NextResponse } from "next/server";
import { errMsg } from "@/lib/errmsg";
import { tooBig } from "@/lib/limit";
import { currentMember } from "@/lib/readers";
import { setMyPhoto } from "@/lib/crm";

export const dynamic = "force-dynamic";

// POST (multipart "file") sets the signed-in member's directory photo, replacing the old one; DELETE removes it.
export async function POST(req: Request) {
  const u = await currentMember().catch(() => null);
  if (!u) return new NextResponse("Sign in first.", { status: 401 });
  if (tooBig(req, 10)) return new NextResponse("That file is too large.", { status: 413 });
  const file = (await req.formData().catch(() => null))?.get("file");
  if (!(file instanceof File)) return new NextResponse("Choose a photo.", { status: 400 });
  try { return NextResponse.json({ url: await setMyPhoto(u.id, file) }); } catch (e: any) { return new NextResponse(errMsg(e), { status: 400 }); }
}

export async function DELETE() {
  const u = await currentMember().catch(() => null);
  if (!u) return new NextResponse("Sign in first.", { status: 401 });
  await setMyPhoto(u.id, null);
  return NextResponse.json({ ok: true });
}
