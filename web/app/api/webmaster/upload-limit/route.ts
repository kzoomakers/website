import { NextResponse } from "next/server";
import { errMsg } from "@/lib/errmsg";
import { actor, editingAllowed } from "@/lib/guard";
import { logAudit } from "@/lib/store";
import { setUploadLimitMb, uploadLimitMb } from "@/lib/image";

// The largest file members and staff may upload. Admin section. POST { mb }.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const a = await req.json().catch(() => null);
  if (!(await editingAllowed("admin", "write"))) return new NextResponse("not found", { status: 404 });
  try {
    await setUploadLimitMb(Number(a?.mb));
    await logAudit(await actor(), "upload.limit", `${a.mb} MB`);
    return NextResponse.json({ mb: await uploadLimitMb() });
  } catch (e: any) { return new NextResponse(errMsg(e), { status: 400 }); }
}
