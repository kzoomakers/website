import { NextResponse } from "next/server";
import { actor, editingAllowed } from "@/lib/guard";
import { deleteFinancial, isPdf, validYear, getOrg, listFinancials, MAX_PDF, putFinancial, saveOrg } from "@/lib/financials";

const off = () => new NextResponse("not found", { status: 404 });

export async function GET() {
  if (!(await editingAllowed("webmaster", "read"))) return off();
  return NextResponse.json({ org: await getOrg(), files: await listFinancials() });
}

export async function PUT(req: Request) {
  if (!(await editingAllowed("webmaster"))) return off();
  const b = await req.json().catch(() => null);
  const org = typeof b?.org === "string" ? b.org.trim() : "";
  if (!org || org.length > 200) return new NextResponse("organization name required", { status: 400 });
  await saveOrg(org, await actor());
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  if (!(await editingAllowed("webmaster"))) return off();
  const form = await req.formData().catch(() => null);
  if (!form) return new NextResponse("could not read the upload (10MB max)", { status: 400 });
  const file = form.get("file"), year = Number(form.get("year"));
  if (!validYear(year)) return new NextResponse("pick a year", { status: 400 });
  if (!(file instanceof File)) return new NextResponse("choose a PDF", { status: 400 });
  if (file.size > MAX_PDF) return new NextResponse("too large (10MB max)", { status: 413 });
  const data = Buffer.from(await file.arrayBuffer());
  if (!isPdf(data)) return new NextResponse("that is not a PDF", { status: 400 });
  await putFinancial(year, file.name, data, await actor());
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  if (!(await editingAllowed("webmaster"))) return off();
  const year = Number(new URL(req.url).searchParams.get("year"));
  if (!validYear(year)) return new NextResponse("bad year", { status: 400 });
  await deleteFinancial(year, await actor());
  return NextResponse.json({ ok: true });
}
