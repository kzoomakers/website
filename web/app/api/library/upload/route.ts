import { NextResponse } from "next/server";
import { errMsg } from "@/lib/errmsg";
import { actor, editingAllowed } from "@/lib/guard";
import { uploadGate } from "@/lib/image";
import { uploadLimitMb } from "@/lib/upload-cfg";
import { logAudit } from "@/lib/store";
import { addUpload } from "@/lib/library/upload";

export const dynamic = "force-dynamic";

// POST multipart "file": one PDF becomes one draft document. The page sends several files as several requests, so the size limit applies to each file, not to the batch. Library editors only.
export async function POST(req: Request) {
  if (!(await editingAllowed("library", "write", "documents"))) return new NextResponse("not found", { status: 404 });
  const who = await actor(), no = await uploadGate(req, "lib:" + who, 200);
  if (no) return no;
  const file = (await req.formData().catch(() => null))?.get("file");
  if (!(file instanceof File)) return new NextResponse("Choose a PDF.", { status: 400 });
  const mb = await uploadLimitMb();
  if (file.size > mb * 1024 * 1024) return new NextResponse(`${file.name}: over the ${mb} MB limit.`, { status: 413 });
  try {
    const slug = await addUpload({ name: file.name, bytes: Buffer.from(await file.arrayBuffer()) }, who);
    await logAudit(who, "library.upload", slug);
    return NextResponse.json({ slug });
  } catch (e) { return new NextResponse(errMsg(e), { status: 400 }); }
}
