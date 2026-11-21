import { NextResponse } from "next/server";
import { libraryOn } from "@/lib/learn-flags";
import { fileFor } from "@/lib/library/docs";
import { fileBytes } from "@/lib/library/store";
import { viewer } from "@/lib/library/viewer";

export const dynamic = "force-dynamic";

// GET: the current PDF of a document the viewer may see (?download=1 to save it; ?v=N an older version, staff only). Missing and not-yours look the same.
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const v = await viewer(), q = new URL(req.url).searchParams;
  const f = (await libraryOn()) || v.staff ? await fileFor(v, (await params).slug, Number(q.get("v"))).catch(() => undefined) : undefined;
  const bytes = f && (await fileBytes(f.key));
  if (!f || !bytes) return new NextResponse("not found", { status: 404 });
  return new NextResponse(Buffer.from(bytes), { headers: {
    "content-type": "application/pdf", "x-content-type-options": "nosniff", "cache-control": "private, no-store",
    "content-disposition": `${q.get("download") === "1" ? "attachment" : "inline"}; filename="${f.d.filename || f.d.slug + ".pdf"}"`,
  } });
}
