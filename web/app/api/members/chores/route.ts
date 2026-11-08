import { NextResponse } from "next/server";
import { currentMember } from "@/lib/readers";
import * as c from "@/lib/chores";

// Member-facing chores: POST { op, ... }, always as the signed-in member. Everyone sees the chores, hours, stats and achievements; you only start, finish and log your own time.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const [u, a] = await Promise.all([currentMember().catch(() => null), req.json().catch(() => null)]);
  if (!u) return new NextResponse("Sign in first.", { status: 401 });
  if (!a?.op) return new NextResponse("bad request", { status: 400 });
  try {
    switch (a.op) {
      case "overview": return NextResponse.json({ chores: await c.listing(), mine: await c.openShifts(u.id), hours: await c.hours(String(a.period ?? "this_month")) });
      case "stats": return NextResponse.json(await c.statsAll());
      case "achievements": return NextResponse.json(await c.achievementsAll());
      case "start": await c.startShift(Number(a.chore_id), u.id, "web", u.email); break;
      case "finish": {
        if (!(await c.openShifts(u.id)).some((s: any) => s.id === Number(a.shift_id))) throw new Error("That isn't one of your open shifts.");
        await c.finishShift(Number(a.shift_id), a.minutes === "" || a.minutes == null ? null : Number(a.minutes));
        break;
      }
      case "log": await c.logTime(Number(a.chore_id), u.id, Number(a.minutes), a.date ? String(a.date) : undefined, "web", "", u.email); break;
      default: return new NextResponse("unknown op", { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) { return new NextResponse(e.message ?? "failed", { status: 400 }); }
}
