import { NextResponse } from "next/server";
import { errMsg } from "@/lib/errmsg";
import { actor, editingAllowed } from "@/lib/guard";
import { logAudit } from "@/lib/store";
import * as c from "@/lib/chores";

// Chores admin RPC: POST { op, ...args }. Reads need Chores view access, everything else Chores edit access.
export const dynamic = "force-dynamic";
const READS = new Set(["list", "chores", "log", "open", "members", "hours", "stats", "achievements"]);
// The admin page each op belongs to (see lib/access.ts), so a person given just that page can use it. An op not listed here needs a whole-section grant.
const PAGE: Record<string, string | string[]> = {
  list: "todo", chores: "todo", open: "todo", save: "todo", snooze: "todo", delete: "todo", start: "todo", finish: "todo", members: ["todo", "log"],
  log: "log", hours: "log", logTime: "log", deleteLog: "log", stats: "stats", achievements: "achievements", saveAchievement: "achievements", deleteAchievement: "achievements",
};

export async function POST(req: Request) {
  const a = await req.json().catch(() => null);
  if (!a?.op) return new NextResponse("bad request", { status: 400 });
  if (!(await editingAllowed("chores", READS.has(a.op) ? "read" : "write", PAGE[a.op]))) return new NextResponse("not found", { status: 404 });
  const who = await actor(), id = Number(a.id);
  try {
    switch (a.op) {
      case "list": return NextResponse.json(await c.listing());
      case "chores": return NextResponse.json(await c.allChores());
      case "log": return NextResponse.json(await c.recentLog());
      case "open": return NextResponse.json(await c.openShifts());
      case "members": return NextResponse.json(await c.members());
      case "hours": return NextResponse.json(await c.hours(String(a.period ?? "this_month")));
      case "stats": return NextResponse.json(await c.statsAll());
      case "achievements": return NextResponse.json(await c.achievementsAll());
      case "save": a.id = await c.saveChore(a.chore ?? {}, who); break;
      case "snooze": await c.snoozeChore(id, Number(a.days)); break;
      case "delete": await c.deleteChore(id); break;
      case "start": await c.startShift(id, Number(a.user_id), "web", who); break;
      case "finish": await c.finishShift(id, a.minutes === "" || a.minutes == null ? null : Number(a.minutes)); break;
      case "logTime": await c.logTime(Number(a.chore_id), Number(a.user_id), Number(a.minutes), a.date ? String(a.date) : undefined, "web", "", who); break;
      case "deleteLog": await c.deleteLog(id); break;
      case "saveAchievement": await c.saveAchievement(a.achievement ?? {}); break;
      case "deleteAchievement": await c.deleteAchievement(id); break;
      default: return new NextResponse("unknown op", { status: 400 });
    }
    await logAudit(who, "chore." + a.op, String(a.chore?.name ?? a.achievement?.title ?? a.id ?? a.chore_id ?? ""));
    return NextResponse.json({ ok: true, id: a.id });
  } catch (e: any) { return new NextResponse(errMsg(e), { status: 400 }); }
}
