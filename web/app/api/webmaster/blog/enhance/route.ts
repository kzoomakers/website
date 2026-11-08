import { NextResponse } from "next/server";
import { errMsg } from "@/lib/errmsg";
import { actor, editingAllowed } from "@/lib/guard";
import { enhancePost } from "@/lib/ai";
import { spend } from "@/lib/limit";

export const dynamic = "force-dynamic";
const MAX = 10, WARN_AT = 7, HOUR = 3600_000;

// POST { tone, html } -> { html, note? }: the AI's rewrite for the editor to preview. Nothing is saved here. Each person gets 10 calls an hour.
export async function POST(req: Request) {
  if (!(await editingAllowed("blog"))) return new NextResponse("not found", { status: 404 });
  const b = await req.json().catch(() => null);
  const q = await spend("enhance:" + (await actor()), MAX, HOUR);
  if (!q.ok) return new NextResponse(`You've used all ${MAX} AI rewrites for this hour. You can try again in ${q.mins} minute${q.mins === 1 ? "" : "s"}.`, { status: 429 });
  try {
    const note = q.used >= WARN_AT ? `You only have ${q.left} more call${q.left === 1 ? "" : "s"} for the next ${q.mins} minute${q.mins === 1 ? "" : "s"}.` : "";
    return NextResponse.json({ html: await enhancePost(b?.tone, b?.html), note });
  } catch (e: any) { return new NextResponse(errMsg(e), { status: 400 }); }
}
