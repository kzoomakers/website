import { NextResponse } from "next/server";
import { imageFail, uploadGate } from "@/lib/image";
import { currentMember } from "@/lib/readers";
import { setMyPhoto } from "@/lib/crm";

export const dynamic = "force-dynamic";

// The chat avatar (DMs). POST (multipart "file") replaces it; DELETE removes it. Separate from the directory photo.
export async function POST(req: Request) {
  const u = await currentMember().catch(() => null);
  if (!u) return new NextResponse("Sign in first.", { status: 401 });
  const no = await uploadGate(req, String(u.id));
  if (no) return no;
  const file = (await req.formData().catch(() => null))?.get("file");
  if (!(file instanceof File)) return new NextResponse("Choose a picture.", { status: 400 });
  try { return NextResponse.json({ url: await setMyPhoto(u.id, file, "avatar") }); } catch (e: any) { return imageFail(e); }
}

export async function DELETE() {
  const u = await currentMember().catch(() => null);
  if (!u) return new NextResponse("Sign in first.", { status: 401 });
  await setMyPhoto(u.id, null, "avatar");
  return NextResponse.json({ ok: true });
}
