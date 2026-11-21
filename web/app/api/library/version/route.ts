import { NextResponse } from "next/server";
import { errMsg } from "@/lib/errmsg";
import { actor, editingAllowed } from "@/lib/guard";
import { uploadGate } from "@/lib/image";
import { uploadLimitMb } from "@/lib/upload-cfg";
import { logAudit } from "@/lib/store";
import { addVersion } from "@/lib/library/upload";

export const dynamic = "force-dynamic";

// POST multipart: file (a PDF), doc (document id), note, reread ("1" = everyone must acknowledge again). Library editors only.
export async function POST(req: Request) {
  if (!(await editingAllowed("library", "write", "documents"))) return new NextResponse("not found", { status: 404 });
  const who = await actor(), no = await uploadGate(req, "lib:" + who, 60);
  if (no) return no;
  const fd = await req.formData().catch(() => null), file = fd?.get("file"), doc = Number(fd?.get("doc"));
  if (!(file instanceof File) || !Number.isInteger(doc)) return new NextResponse("Choose a PDF.", { status: 400 });
  const mb = await uploadLimitMb();
  if (file.size > mb * 1024 * 1024) return new NextResponse(`Over the ${mb} MB limit.`, { status: 413 });
  try {
    const v = await addVersion(doc, { name: file.name, bytes: Buffer.from(await file.arrayBuffer()) }, { note: fd?.get("note"), reread: fd?.get("reread") === "1" }, who);
    await logAudit(who, "library.version", `document ${doc} v${v}`);
    return NextResponse.json({ version: v });
  } catch (e) { return new NextResponse(errMsg(e), { status: 400 }); }
}
