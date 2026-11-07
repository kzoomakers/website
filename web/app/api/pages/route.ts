import { NextResponse } from "next/server";
import { deletedPages, deletePage, getPage, listPages, pageExists, pageHistory, pageRevision, restoreMenuFor, savePage } from "@/lib/store";
import { actor, editingAllowed } from "@/lib/guard";

const off = () => new NextResponse("not found", { status: 404 });

export async function GET(req: Request) {
  if (!(await editingAllowed())) return off();
  const q = new URL(req.url).searchParams;
  if (q.has("deleted")) return NextResponse.json(await deletedPages());
  if (q.has("history")) return NextResponse.json(await pageHistory(q.get("history")!));
  if (q.has("rev")) {
    const r = await pageRevision(Number(q.get("rev")));
    return r ? NextResponse.json(r.data) : off();
  }
  const slug = q.get("slug");
  if (slug === null) return NextResponse.json(await listPages());
  const data = await getPage(slug);
  return data ? NextResponse.json(data) : off();
}

export async function PUT(req: Request) {
  if (!await editingAllowed()) return off();
  const { slug, data } = await req.json();
  if (typeof slug !== "string" || !Array.isArray(data?.content)) return new NextResponse("bad request", { status: 400 });
  try { await savePage(slug, data, await actor()); } catch { return new NextResponse("bad slug", { status: 400 }); }
  return NextResponse.json({ ok: true });
}

// Revert a page to an old revision, or restore a deleted one (same thing, but the slug must be free).
export async function POST(req: Request) {
  if (!await editingAllowed()) return off();
  const { slug, revision, restore } = await req.json();
  const rev = Number.isInteger(revision) ? await pageRevision(revision) : undefined;
  if (!rev || rev.slug !== slug) return off();
  if (restore && await pageExists(slug)) return new NextResponse("a page with that slug already exists", { status: 409 });
  const who = await actor();
  await savePage(slug, rev.data, who, restore ? "page.restore" : "page.revert", `revision #${revision}`);
  if (restore) await restoreMenuFor(slug, revision, who);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  if (!await editingAllowed()) return off();
  const q = new URL(req.url).searchParams;
  const slug = q.get("slug") ?? "";
  try { await deletePage(slug, await actor(), q.has("menu")); } catch { return new NextResponse("bad slug", { status: 400 }); }
  return NextResponse.json({ ok: true });
}
