import { NextResponse } from "next/server";
import { access, isRes } from "@/lib/guest-access";
import { signedPdfOf } from "@/lib/guests";

export const dynamic = "force-dynamic";

// GET ?g=<id> (host) or ?t=<token> (the guest): their latest signed guest agreement as a PDF.
export async function GET(req: Request) {
  const a = await access(req);
  if (isRes(a)) return a;
  const f = await signedPdfOf(a.g.id);
  return f ? new NextResponse(new Uint8Array(f.pdf), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${f.title.replace(/[^\w.-]+/g, "_").slice(0, 60)}.pdf"`, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } }) : new NextResponse("not signed yet", { status: 404 });
}
