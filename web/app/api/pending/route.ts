import { NextResponse } from "next/server";
import { currentApplicant } from "@/lib/readers";
import { detail, reply } from "@/lib/approvals";

export const dynamic = "force-dynamic";

// The applicant's own thread (staff notes and staff emails are never included) and their replies.
const view = async (id: number) => {
  const d = await detail(id, true);
  return d && { name: d.name, approval: d.approval, events: d.events.map((e) => ({ id: e.id, kind: e.kind, to_state: e.to_state, body: e.body, at: e.at, mine: e.by_applicant })) };
};

export async function GET() {
  const u = await currentApplicant().catch(() => null);
  if (!u) return new NextResponse("Sign in first.", { status: 401 });
  return NextResponse.json(await view(u.id), { headers: { "cache-control": "no-store" } });
}

// POST { body }
export async function POST(req: Request) {
  const u = await currentApplicant().catch(() => null), b = await req.json().catch(() => null);
  if (!u) return new NextResponse("Sign in first.", { status: 401 });
  if (typeof b?.body !== "string") return new NextResponse("bad request", { status: 400 });
  try { await reply(u.id, b.body); return NextResponse.json(await view(u.id)); } catch (e: any) { return new NextResponse(e.message ?? "failed", { status: 400 }); }
}
