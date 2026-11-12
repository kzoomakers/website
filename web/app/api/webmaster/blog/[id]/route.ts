import { NextResponse } from "next/server";
import { postHistory, revertPost } from "@/lib/blog";
import { actor, editingAllowed } from "@/lib/guard";

type P = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: P) {
  if (!(await editingAllowed("blog", "read", "posts"))) return new NextResponse("not found", { status: 404 });
  return NextResponse.json(await postHistory(Number((await params).id)));
}

export async function POST(req: Request, { params }: P) {
  if (!(await editingAllowed("blog", "write", "posts"))) return new NextResponse("not found", { status: 404 });
  const { revert } = await req.json().catch(() => ({}));
  const post = Number.isInteger(revert) && (await revertPost(Number((await params).id), revert, await actor()).catch(() => null));
  return post ? NextResponse.json(post) : new NextResponse("no such revision", { status: 404 });
}
