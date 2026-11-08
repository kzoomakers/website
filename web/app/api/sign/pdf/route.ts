import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { byToken, cookieOf, sourcePdf, unlocked } from "@/lib/sign";

export const dynamic = "force-dynamic";

// GET ?token=: the PDF a signer is being asked to sign (decrypted on the way out), once their password / code check has passed.
export async function GET(req: Request) {
  const f = db() ? await byToken(new URL(req.url).searchParams.get("token") ?? "").catch(() => null) : null;
  if (!f || !f.doc.has_pdf || (f.signer.locked && !unlocked(f.signer.id, cookieOf(req, "su" + f.signer.id)))) return new NextResponse("not found", { status: 404 });
  const pdf = await sourcePdf(f.doc.id);
  return pdf ? new NextResponse(new Uint8Array(pdf), { headers: { "content-type": "application/pdf", "cache-control": "no-store", "x-content-type-options": "nosniff" } }) : new NextResponse("not found", { status: 404 });
}
