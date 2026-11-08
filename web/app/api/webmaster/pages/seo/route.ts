import { NextResponse } from "next/server";
import { errMsg } from "@/lib/errmsg";
import { actor, editingAllowed } from "@/lib/guard";
import { suggestSeo } from "@/lib/ai";
import { spend } from "@/lib/limit";

export const dynamic = "force-dynamic";
const MAX = 20, HOUR = 3600_000;

// POST { title, text } -> { description, aiSummary, aiFaqs }: suggestions for the page editor to preview. Nothing is saved here. 20 calls an hour per person.
export async function POST(req: Request) {
  if (!(await editingAllowed("webmaster"))) return new NextResponse("not found", { status: 404 });
  const b = await req.json().catch(() => null);
  const q = await spend("seo:" + (await actor()), MAX, HOUR);
  if (!q.ok) return new NextResponse(`You've used all ${MAX} AI suggestions for this hour. You can try again in ${q.mins} minute${q.mins === 1 ? "" : "s"}.`, { status: 429 });
  try { return NextResponse.json(await suggestSeo(b?.title, b?.text)); } catch (e: any) { return new NextResponse(errMsg(e), { status: 400 }); }
}
