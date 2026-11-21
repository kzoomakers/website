import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { fileBytes } from "@/lib/library/docs";
import { shareByToken, unlockValue } from "@/lib/library/shares";

export const dynamic = "force-dynamic";

// GET: the PDF behind a live, unlocked share link. ?download=1 only when the link allows it.
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const s = await shareByToken((await params).token);
  if (!s || (await cookies()).get("ls_" + s.id)?.value !== unlockValue(s)) return new NextResponse("not found", { status: 404 });
  const dl = new URL(req.url).searchParams.get("download") === "1";
  if (dl && !s.allow_download) return new NextResponse("not found", { status: 404 });
  const bytes = await fileBytes(s.s3_key);
  if (!bytes) return new NextResponse("not found", { status: 404 });
  return new NextResponse(Buffer.from(bytes), { headers: { "content-type": "application/pdf", "x-content-type-options": "nosniff", "cache-control": "private, no-store", "x-robots-tag": "noindex", "content-disposition": `${dl ? "attachment" : "inline"}; filename="${s.filename || "document.pdf"}"` } });
}
