import { NextResponse } from "next/server";
import { imageFail, uploadGate } from "@/lib/image";
import { currentMember } from "@/lib/readers";
import { submitReview } from "@/lib/reviews";

// multipart: text, role?, photo? (an image of the reviewer)
export async function POST(req: Request) {
  const u = await currentMember();
  if (!u) return new NextResponse("Please sign in to leave a review.", { status: 401 });
  const no = await uploadGate(req, String(u.id));
  if (no) return no;
  const f = await req.formData().catch(() => null), text = f?.get("text"), role = f?.get("role"), photo = f?.get("photo");
  if (typeof text !== "string") return new NextResponse("bad request", { status: 400 });
  try {
    await submitReview(u, text, typeof role === "string" ? role : "", photo instanceof File ? photo : null);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return imageFail(e);
  }
}
