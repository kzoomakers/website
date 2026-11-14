import { NextResponse } from "next/server";
import { currentApplicant } from "@/lib/readers";
import { myPdf } from "@/lib/waiver";

export const dynamic = "force-dynamic";

// GET ?doc=<id>: the signed-in person's own signed agreement PDF (never anyone else's).
export async function GET(req: Request) {
  const u = await currentApplicant().catch(() => null);
  if (!u) return new NextResponse("Sign in first.", { status: 401 });
  const f = await myPdf(u.id, Number(new URL(req.url).searchParams.get("doc")));
  return f ? new NextResponse(new Uint8Array(f.pdf), { headers: { "content-type": "application/pdf", "content-disposition": `${new URL(req.url).searchParams.has("inline") ? "inline" : "attachment"}; filename="${f.title.replace(/[^\w.-]+/g, "_").slice(0, 60)}.pdf"`, "cache-control": "no-store" } }) : new NextResponse("not found", { status: 404 });
}
