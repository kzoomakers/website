import { NextResponse } from "next/server";
import { errMsg } from "@/lib/errmsg";
import { actor, editingAllowed } from "@/lib/guard";
import { logAudit } from "@/lib/store";
import { setUploadLimits, uploadLimits } from "@/lib/upload-cfg";

// The largest request signed-in people may upload and the largest anyone else may send. Admin section. POST { mb, publicMb }.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const a = await req.json().catch(() => null);
  if (!(await editingAllowed("admin", "write"))) return new NextResponse("not found", { status: 404 });
  try {
    await setUploadLimits({ mb: Number(a?.mb), publicMb: Number(a?.publicMb) });
    await logAudit(await actor(), "upload.limit", `signed-in ${a.mb} MB, public ${a.publicMb} MB`);
    return NextResponse.json(await uploadLimits(true));
  } catch (e: any) { return new NextResponse(errMsg(e), { status: 400 }); }
}
