import { NextResponse } from "next/server";
import { imageFail, uploadGate } from "@/lib/image";
import { currentMember } from "@/lib/readers";
import { storeArt } from "@/lib/crm";

export const dynamic = "force-dynamic";

// POST (multipart "file") stores class artwork for a proposal and returns its URL.
export async function POST(req: Request) {
  const u = await currentMember().catch(() => null);
  if (!u) return new NextResponse("Sign in first.", { status: 401 });
  const no = await uploadGate(req, String(u.id));
  if (no) return no;
  const file = (await req.formData().catch(() => null))?.get("file");
  if (!(file instanceof File)) return new NextResponse("Choose an image.", { status: 400 });
  try { return NextResponse.json({ url: await storeArt(file) }); } catch (e: any) { return imageFail(e); }
}
