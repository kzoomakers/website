import { NextResponse } from "next/server";
import { editingAllowed } from "@/lib/guard";
import { signedKind, signedPdf } from "@/lib/sign";
import { buildAgreementPdf } from "@/lib/sign-pdf";
import { getVersion } from "@/lib/waiver";

export const dynamic = "force-dynamic";

// GET ?ver=<version id> returns a blank PDF of that agreement version (CRM view access); GET ?pdf=<doc id> returns a signed board paper (Board view access).
// Member IDs and signed waivers / guest agreements are personal information: they only come from /api/pii/retrieve (reason required, logged), never from here.
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams, hdr = { "cache-control": "no-store", "x-content-type-options": "nosniff" };
  if (q.get("ver")) { // a blank copy of one agreement version, for legal review or printing
    if (!(await editingAllowed("people", "read", ["waiver", "guest-agreement"]))) return new NextResponse("not found", { status: 404 });
    const v = await getVersion(Number(q.get("ver")));
    return v ? new NextResponse(new Uint8Array(await buildAgreementPdf(v, null)), { headers: { ...hdr, "content-type": "application/pdf", "content-disposition": `attachment; filename="membership-agreement-${v.revision.replace(/[^\w.-]+/g, "_")}.pdf"` } }) : new NextResponse("not found", { status: 404 });
  }
  const kind = await signedKind(Number(q.get("pdf")));
  if (!kind || kind === "waiver" || kind === "guest" || !(await editingAllowed("signdocs", "read", ["documents"]))) return new NextResponse("not found", { status: 404 }); // authorize before the decrypt
  const f = await signedPdf(Number(q.get("pdf")));
  return f ? new NextResponse(new Uint8Array(f.pdf), { headers: { ...hdr, "content-type": "application/pdf", "content-disposition": `attachment; filename="${f.title.replace(/[^\w.-]+/g, "_").slice(0, 60)}.pdf"` } }) : new NextResponse("not found", { status: 404 });
}
