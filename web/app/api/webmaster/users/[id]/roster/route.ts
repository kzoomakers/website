import { NextResponse } from "next/server";
import { actor, editingAllowed } from "@/lib/guard";
import { getRoster, setRoster } from "@/lib/profiles";
import { imageFail, processImage, uploadGate } from "@/lib/image";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
const off = () => new NextResponse("not found", { status: 404 });
const uid = async (c: Ctx) => { const n = Number((await c.params).id); return Number.isInteger(n) ? n : null; };

// The member-roster photo is internal only: staff with CRM access read it, staff with write access set or remove it. No member or public route serves it.
export async function GET(_: Request, c: Ctx) {
  const id = await uid(c);
  if (id === null || !(await editingAllowed("crm", "read", "people"))) return off();
  const img = await getRoster(id);
  return img ? new NextResponse(new Uint8Array(img), { headers: { "content-type": "image/webp", "cache-control": "private, no-store", "x-content-type-options": "nosniff" } }) : off();
}

// POST (multipart "file"): a portrait, cropped to 3:4 and shrunk.
export async function POST(req: Request, c: Ctx) {
  const id = await uid(c);
  if (id === null || !(await editingAllowed("crm", "write", "people"))) return off();
  const who = await actor(), no = await uploadGate(req, "roster:" + who, 60);
  if (no) return no;
  const file = (await req.formData().catch(() => null))?.get("file");
  if (!(file instanceof File)) return new NextResponse("Choose a photo.", { status: 400 });
  try { await setRoster(id, (await processImage(file, { still: true, fit: { width: 600, height: 800, cover: true } })).data, who); return NextResponse.json({ ok: true }); } catch (e) { return imageFail(e); }
}

export async function DELETE(_: Request, c: Ctx) {
  const id = await uid(c);
  if (id === null || !(await editingAllowed("crm", "write", "people"))) return off();
  await setRoster(id, null, await actor());
  return NextResponse.json({ ok: true });
}
