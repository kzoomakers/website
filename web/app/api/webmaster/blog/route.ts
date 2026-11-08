import { NextResponse } from "next/server";
import { errMsg } from "@/lib/errmsg";
import { deletePost, listPosts, savePost } from "@/lib/blog";
import { actor, editingAllowed } from "@/lib/guard";

const s = (v: unknown) => typeof v === "string";

export async function GET() {
  if (!(await editingAllowed("blog", "read"))) return new NextResponse("not found", { status: 404 });
  return NextResponse.json(await listPosts(true));
}

// Create (no id) or update.
export async function POST(req: Request) {
  if (!(await editingAllowed("blog"))) return new NextResponse("not found", { status: 404 });
  const b = await req.json().catch(() => null);
  if (!s(b?.title) || !s(b?.slug) || !s(b?.excerpt) || !s(b?.body) || !s(b?.image) || !Array.isArray(b?.tags) || !b.tags.every(s) || !["draft", "published"].includes(b?.status)
    || (b.publish_at && isNaN(Date.parse(b.publish_at))) || (b.id != null && !Number.isInteger(b.id)) || (b.author_id != null && !Number.isInteger(b.author_id)) || !Array.isArray(b.category_ids) || !b.category_ids.every(Number.isInteger)) return new NextResponse("bad post", { status: 400 });
  try {
    return NextResponse.json(await savePost({ id: b.id, title: b.title, slug: b.slug, excerpt: b.excerpt, body: b.body, image: b.image, tags: b.tags, status: b.status, publish_at: b.publish_at || null, author_id: b.author_id ?? null, category_ids: b.category_ids }, await actor()));
  } catch (e: any) {
    return new NextResponse(e.code === "23505" ? "That URL slug is already used." : errMsg(e), { status: 400 });
  }
}

export async function DELETE(req: Request) {
  if (!(await editingAllowed("blog"))) return new NextResponse("not found", { status: 404 });
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id)) return new NextResponse("bad id", { status: 400 });
  await deletePost(id, await actor());
  return NextResponse.json({ ok: true });
}
