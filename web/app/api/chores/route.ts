import { NextResponse } from "next/server";
import { errMsg } from "@/lib/errmsg";
import { keyAllows } from "@/lib/api-keys";
import * as c from "@/lib/chores";

// Chores API for other systems (YAMNet). Authorization: Bearer <key made in Admin > People & access > API keys>.
//   GET  ?which=due|all                       chores:read   the chores, when each is due, who is on one now
//   POST { op: "hours", period, member_id? }  chores:read   hours given since a period began (today, this_week, this_month, this_year, all_time)
//   POST { op: "open", member_id }            chores:read   a member's unfinished shifts
//   POST { op: "who", name }                  chores:write  which CRM member a spoken name is: match | ambiguous | maybe (near matches to judge) | none
//   POST { op: "start", chore_id, member_id } chores:write  start a shift now
//   POST { op: "finish", shift_id, minutes? } chores:write  finish it now (or after `minutes`)
//   POST { op: "log", chore_id, member_id, minutes, date?, said? }  chores:write  time already done
export const dynamic = "force-dynamic";
const READS = new Set(["hours", "open"]);
const fail = (m: string, status = 400) => NextResponse.json({ error: m }, { status });

export async function GET(req: Request) {
  const who = await keyAllows(req, "chores:read").catch(() => null);
  if (!who) return fail("unauthorized", 401);
  return NextResponse.json({ now: Date.now() / 1000, chores: await c.listing(new URL(req.url).searchParams.get("which") === "due" ? "due" : "all") });
}

export async function POST(req: Request) {
  const a = await req.json().catch(() => null);
  if (!a?.op) return fail("bad request");
  const who = await keyAllows(req, READS.has(a.op) ? "chores:read" : "chores:write").catch(() => null);
  if (!who) return fail("unauthorized", 401);
  const member = Number(a.member_id);
  try {
    switch (a.op) {
      case "hours": return NextResponse.json(await c.hours(String(a.period ?? "this_month"), Number.isInteger(member) && a.member_id != null ? member : undefined));
      case "open": return NextResponse.json(await c.openShifts(member));
      case "who": return NextResponse.json(await c.whoIs(a.name));
      case "start": return NextResponse.json({ id: await c.startShift(Number(a.chore_id), member, "api", who) });
      case "finish": return NextResponse.json(await c.finishShift(Number(a.shift_id), a.minutes == null ? null : Number(a.minutes)));
      case "log": return NextResponse.json({ id: await c.logTime(Number(a.chore_id), member, Number(a.minutes), a.date ? String(a.date) : undefined, "api", String(a.said ?? ""), who) });
      default: return fail("unknown op");
    }
  } catch (e: any) { return fail(errMsg(e)); }
}
