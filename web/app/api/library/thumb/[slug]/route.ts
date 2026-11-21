import { NextResponse } from "next/server";
import { libraryOn } from "@/lib/learn-flags";
import { fileBytes, getDoc } from "@/lib/library/docs";
import { viewer } from "@/lib/library/viewer";

export const dynamic = "force-dynamic";

// GET: the page-1 thumbnail of a document the viewer may see. Same tier check as the PDF itself.
export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const v = await viewer(), d = (await libraryOn()) || v.staff ? await getDoc(v, (await params).slug).catch(() => null) : null;
  const bytes = d?.thumb_key && (await fileBytes(d.thumb_key));
  if (!bytes) return new NextResponse("not found", { status: 404 });
  return new NextResponse(Buffer.from(bytes), { headers: { "content-type": "image/webp", "x-content-type-options": "nosniff", "cache-control": "private, max-age=3600" } });
}
