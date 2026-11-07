import { NextResponse } from "next/server";
import { currentReader } from "@/lib/readers";
import { addComment, hashIp } from "@/lib/comments";
import { baseUrl } from "@/lib/mail";

export async function POST(req: Request) {
  const u = await currentReader();
  if (!u) return new NextResponse("Please sign in to comment.", { status: 401 });
  const b = await req.json().catch(() => null);
  if (!Number.isInteger(b?.postId) || typeof b?.body !== "string" || (b.parentId != null && !Number.isInteger(b.parentId))) return new NextResponse("bad request", { status: 400 });
  // Honeypot: the form hides this field from people; bots fill it. Pretend it worked.
  if (b.website) return NextResponse.json({ id: -Date.now(), parent: b.parentId ?? null, name: u.name, body: b.body, at: new Date().toISOString(), likes: 0, liked: false, mine: true, pending: true, removed: false, staff: false });
  try {
    return NextResponse.json(await addComment({ postId: b.postId, userId: u.id, body: b.body, parentId: b.parentId, ipHash: hashIp(req), base: await baseUrl(req) }));
  } catch (e: any) {
    return new NextResponse(e.message, { status: 400 });
  }
}
