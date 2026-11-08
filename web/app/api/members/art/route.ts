import { NextResponse } from "next/server";
import { tooBig } from "@/lib/limit";
import { currentMember } from "@/lib/readers";
import { storeArt } from "@/lib/crm";

export const dynamic = "force-dynamic";

// POST (multipart "file") stores class artwork for a proposal and returns its URL.
export async function POST(req: Request) {
  if (!(await currentMember().catch(() => null))) return new NextResponse("Sign in first.", { status: 401 });
  if (tooBig(req, 10)) return new NextResponse("That file is too large.", { status: 413 });
  const file = (await req.formData().catch(() => null))?.get("file");
  if (!(file instanceof File)) return new NextResponse("Choose an image.", { status: 400 });
  try { return NextResponse.json({ url: await storeArt(file) }); } catch (e: any) { return new NextResponse(e.message, { status: 400 }); }
}
