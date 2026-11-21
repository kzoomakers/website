import { NextResponse } from "next/server";
import { libraryOn } from "@/lib/learn-flags";
import { fileBytes, getDoc } from "@/lib/library/docs";
import { viewer } from "@/lib/library/viewer";

export const dynamic = "force-dynamic";

// GET: the current PDF of a document the viewer may see (?download=1 to save it). Missing and not-yours look the same.
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const v = await viewer(), d = (await libraryOn()) || v.staff ? await getDoc(v, (await params).slug).catch(() => null) : null;
  const bytes = d && (await fileBytes(d.s3_key));
  if (!d || !bytes) return new NextResponse("not found", { status: 404 });
  const dl = new URL(req.url).searchParams.get("download") === "1";
  return new NextResponse(Buffer.from(bytes), { headers: {
    "content-type": "application/pdf", "x-content-type-options": "nosniff", "cache-control": "private, no-store",
    "content-disposition": `${dl ? "attachment" : "inline"}; filename="${d.filename || d.slug + ".pdf"}"`,
  } });
}
