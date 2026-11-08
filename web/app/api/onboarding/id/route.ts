import { NextResponse } from "next/server";
import { errMsg } from "@/lib/errmsg";
import { tooBig } from "@/lib/limit";
import { currentApplicant } from "@/lib/readers";
import * as o from "@/lib/onboarding";

export const dynamic = "force-dynamic";

// POST multipart { kind, expires, file }: the member's photo ID, stored encrypted.
export async function POST(req: Request) {
  const u = await currentApplicant().catch(() => null);
  if (!u || u.approval !== "approved") return new NextResponse("Sign in first.", { status: 401 });
  if (tooBig(req, 13)) return new NextResponse("That file is too large.", { status: 413 });
  const f = await req.formData().catch(() => null), file = f?.get("file");
  if (!f || !(file instanceof File)) return new NextResponse("Choose a photo or scan of your ID.", { status: 400 });
  try { await o.storeId(u.id, String(f.get("kind") ?? ""), String(f.get("expires") ?? ""), file); return NextResponse.json({ step: "done" }); }
  catch (e: any) { return new NextResponse(errMsg(e), { status: 400 }); }
}
