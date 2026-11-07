import { NextResponse } from "next/server";
import { currentReader } from "@/lib/readers";
import { submitReview } from "@/lib/reviews";

// multipart: text, role?, photo? (an image of the reviewer)
export async function POST(req: Request) {
  const u = await currentReader();
  if (!u) return new NextResponse("Please sign in to leave a review.", { status: 401 });
  const f = await req.formData().catch(() => null), text = f?.get("text"), role = f?.get("role"), photo = f?.get("photo");
  if (typeof text !== "string") return new NextResponse("bad request", { status: 400 });
  try {
    await submitReview(u, text, typeof role === "string" ? role : "", photo instanceof File ? photo : null);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return new NextResponse(e.message, { status: 400 });
  }
}
