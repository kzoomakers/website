import { NextResponse } from "next/server";
import { actor, editingAllowed } from "@/lib/guard";
import { viewId } from "@/lib/onboarding";
import { signedKind, signedPdf } from "@/lib/sign";
import { buildAgreementPdf } from "@/lib/sign-pdf";
import { getVersion } from "@/lib/waiver";

export const dynamic = "force-dynamic";

// GET ?ver=<version id> returns a blank PDF of that agreement version (CRM view access); GET ?id=<user id> returns that member's photo ID (CRM edit access, audit-logged); GET ?pdf=<doc id> returns a signed PDF (CRM edit access for waivers, Board view access for board papers).
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams, hdr = { "cache-control": "no-store", "x-content-type-options": "nosniff" };
  if (q.get("id")) {
    if (!(await editingAllowed("crm"))) return new NextResponse("not found", { status: 404 });
    const img = await viewId(Number(q.get("id")), await actor());
    return img ? new NextResponse(new Uint8Array(img), { headers: { ...hdr, "content-type": img.subarray(8, 12).toString("latin1") === "WEBP" ? "image/webp" : "image/jpeg", "content-disposition": "inline" } }) : new NextResponse("none on file", { status: 404 });
  }
  if (q.get("ver")) { // a blank copy of one agreement version, for legal review or printing
    if (!(await editingAllowed("crm", "read"))) return new NextResponse("not found", { status: 404 });
    const v = await getVersion(Number(q.get("ver")));
    return v ? new NextResponse(new Uint8Array(await buildAgreementPdf(v, null)), { headers: { ...hdr, "content-type": "application/pdf", "content-disposition": `attachment; filename="membership-agreement-${v.revision.replace(/[^\w.-]+/g, "_")}.pdf"` } }) : new NextResponse("not found", { status: 404 });
  }
  const kind = await signedKind(Number(q.get("pdf")));
  if (!kind || !(await editingAllowed(kind === "waiver" || kind === "guest" ? "crm" : "board", "read"))) return new NextResponse("not found", { status: 404 }); // authorize before the decrypt
  const f = await signedPdf(Number(q.get("pdf")));
  return f ? new NextResponse(new Uint8Array(f.pdf), { headers: { ...hdr, "content-type": "application/pdf", "content-disposition": `attachment; filename="${f.title.replace(/[^\w.-]+/g, "_").slice(0, 60)}.pdf"` } }) : new NextResponse("not found", { status: 404 });
}
