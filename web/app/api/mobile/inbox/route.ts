import { NextResponse } from "next/server";
import { currentMember } from "@/lib/readers";
import { conversations, thread } from "@/lib/crm";
import { listNotes } from "@/lib/notifications";

export const dynamic = "force-dynamic";

// The phone app's Inbox. No query: conversations plus other notices. ?with=<member id>: that conversation (opening it marks it read). Replies go through /api/members { op: "message" }; notices are marked read via /api/notifications.
export async function GET(req: Request) {
  const u = await currentMember().catch(() => null);
  if (!u) return new NextResponse("Sign in first.", { status: 401 });
  const w = new URL(req.url).searchParams.get("with");
  if (w !== null) {
    const t = await thread(u.id, Number(w) || 0);
    return t ? NextResponse.json(t) : new NextResponse("not found", { status: 404 });
  }
  const [convos, { notes }] = await Promise.all([conversations(u.id), listNotes(u.id, 100)]);
  return NextResponse.json({ conversations: convos, notices: notes.filter((n) => n.kind !== "member.message") });
}
