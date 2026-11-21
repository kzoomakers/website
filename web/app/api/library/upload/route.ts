import { NextResponse } from "next/server";
import { errMsg } from "@/lib/errmsg";
import { actor, editingAllowed } from "@/lib/guard";
import { uploadGate } from "@/lib/image";
import { uploadLimitMb } from "@/lib/upload-cfg";
import { logAudit } from "@/lib/store";
import { addUpload } from "@/lib/library/docs";

export const dynamic = "force-dynamic";

// POST multipart "file" (one or more PDFs): each becomes a draft document. Library editors only.
export async function POST(req: Request) {
  if (!(await editingAllowed("library", "write", "documents"))) return new NextResponse("not found", { status: 404 });
  const who = await actor(), no = await uploadGate(req, "lib:" + who, 60);
  if (no) return no;
  const files = ((await req.formData().catch(() => null))?.getAll("file") ?? []).filter((f): f is File => f instanceof File).slice(0, 40);
  if (!files.length) return new NextResponse("Choose a PDF.", { status: 400 });
  const mb = await uploadLimitMb(), done: { name: string; slug?: string; error?: string }[] = [];
  for (const f of files) { // one at a time: the PDF reader is a child process
    if (f.size > mb * 1024 * 1024) { done.push({ name: f.name, error: `Over the ${mb} MB limit.` }); continue; }
    try { const slug = await addUpload({ name: f.name, bytes: Buffer.from(await f.arrayBuffer()) }, who); done.push({ name: f.name, slug }); await logAudit(who, "library.upload", slug); }
    catch (e) { done.push({ name: f.name, error: errMsg(e) }); }
  }
  return NextResponse.json({ done });
}
