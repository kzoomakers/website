import { NextResponse } from "next/server";
import { currentMember } from "@/lib/readers";
import { baseUrl } from "@/lib/mail";
import * as c from "@/lib/crm";

// Member-facing endpoint: POST { op, ... } for the signed-in member only.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const [u, a] = await Promise.all([currentMember().catch(() => null), req.json().catch(() => null)]);
  if (!u) return new NextResponse("Sign in first.", { status: 401 });
  if (!a?.op) return new NextResponse("bad request", { status: 400 });
  try {
    switch (a.op) {
      case "search": return NextResponse.json(await c.searchDirectory(String(a.q ?? ""), String(a.level ?? ""), a.filters ?? {}));
      case "saveSkills": await c.setMySkills(u.id, a); break;
      case "message": await c.messageMember(u.id, Number(a.to), String(a.body ?? ""), await baseUrl(req)); break;
      case "signup": await c.signUp(u.id, Number(a.id)); return NextResponse.json(await c.upcomingClasses(u.id));
      case "propose": await c.proposeClass(u, a); return NextResponse.json(await c.myProposals(u.id));
      case "withdraw": await c.withdrawProposal(u.id, Number(a.id)); return NextResponse.json(await c.myProposals(u.id));
      case "cancel": await c.cancelSignUp(u.id, Number(a.id)); return NextResponse.json(await c.upcomingClasses(u.id));
      default: return new NextResponse("unknown op", { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return new NextResponse(e.message ?? "failed", { status: 400 });
  }
}
