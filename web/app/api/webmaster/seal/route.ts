import { NextResponse } from "next/server";
import { errMsg } from "@/lib/errmsg";
import { actor, editingAllowed } from "@/lib/guard";
import { logAudit } from "@/lib/store";
import { generateSeal, removeSeal, sealInfo, uploadSeal } from "@/lib/pdf-seal";

// Digital-signature certificate for finished PDFs. Admin section. POST JSON { op: "generate" | "remove" } or multipart { file, pass } to upload a .p12.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const multipart = req.headers.get("content-type")?.startsWith("multipart/");
  const form = multipart ? await req.formData().catch(() => null) : null;
  const a = multipart ? { op: "upload" } : await req.json().catch(() => null);
  if (!a?.op || (multipart && !form)) return new NextResponse("bad request", { status: 400 });
  if (!(await editingAllowed("admin", "write"))) return new NextResponse("not found", { status: 404 });
  try {
    switch (a.op) {
      case "generate": await generateSeal(String(a.org ?? "")); break;
      case "remove": await removeSeal(); break;
      case "upload": {
        const f = form!.get("file");
        if (!(f instanceof File) || f.size > 1e6) return new NextResponse("choose a .p12 file under 1 MB", { status: 400 });
        await uploadSeal(Buffer.from(await f.arrayBuffer()), String(form!.get("pass") ?? ""));
        break;
      }
      default: return new NextResponse("unknown op", { status: 400 });
    }
    await logAudit(await actor(), "seal." + a.op, "");
    return NextResponse.json(await sealInfo());
  } catch (e: any) { return new NextResponse(errMsg(e), { status: 400 }); }
}
