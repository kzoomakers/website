import { NextResponse } from "next/server";
import { imageFail, uploadGate } from "@/lib/image";
import { currentMember } from "@/lib/readers";
import { submitRenewal } from "@/lib/id-card";

export const dynamic = "force-dynamic";

// POST multipart { kind, expires, file }: a replacement ID. It goes to staff review; the ID on file stays until they approve it.
export async function POST(req: Request) {
  const u = await currentMember().catch(() => null);
  if (!u) return new NextResponse("Sign in first.", { status: 401 });
  const no = await uploadGate(req, String(u.id));
  if (no) return no;
  const f = await req.formData().catch(() => null), file = f?.get("file");
  if (!f || !(file instanceof File)) return new NextResponse("Choose a photo or scan of your ID.", { status: 400 });
  try { await submitRenewal(u, String(f.get("kind") ?? ""), String(f.get("expires") ?? ""), file); return NextResponse.json({ ok: true }); }
  catch (e: any) { return imageFail(e); }
}
