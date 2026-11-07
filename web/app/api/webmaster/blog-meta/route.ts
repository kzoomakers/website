import { NextResponse } from "next/server";
import { deleteLookup, listAuthors, listCategories, saveAuthor, saveCategory } from "@/lib/blog";
import { actor, editingAllowed } from "@/lib/guard";

const KINDS = ["author", "category"];

export async function GET() {
  if (!(await editingAllowed())) return new NextResponse("not found", { status: 404 });
  return NextResponse.json({ authors: await listAuthors(), categories: await listCategories() });
}

// { kind: "author" | "category", ...fields }; id present = update.
export async function POST(req: Request) {
  if (!(await editingAllowed())) return new NextResponse("not found", { status: 404 });
  const b = await req.json().catch(() => null);
  if (!KINDS.includes(b?.kind) || (b.id != null && !Number.isInteger(b.id))) return new NextResponse("bad request", { status: 400 });
  const str = (k: string) => (typeof b[k] === "string" ? b[k] : "");
  try {
    return NextResponse.json(b.kind === "author"
      ? await saveAuthor({ id: b.id, name: str("name"), email: str("email"), bio: str("bio"), image: str("image") }, await actor())
      : await saveCategory({ id: b.id, name: str("name"), slug: str("slug"), description: str("description") }, await actor()));
  } catch (e: any) {
    return new NextResponse(e.code === "23505" ? "That slug is already used." : e.message, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  if (!(await editingAllowed())) return new NextResponse("not found", { status: 404 });
  const u = new URL(req.url), id = Number(u.searchParams.get("id")), kind = u.searchParams.get("kind");
  if (!Number.isInteger(id) || !KINDS.includes(kind!)) return new NextResponse("bad request", { status: 400 });
  await deleteLookup(kind as "author" | "category", id, await actor());
  return NextResponse.json({ ok: true });
}
