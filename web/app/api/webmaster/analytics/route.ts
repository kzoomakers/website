import { NextResponse } from "next/server";
import { errMsg } from "@/lib/errmsg";
import { editingAllowed } from "@/lib/guard";
import { bounds, report, realtime, span, type Range } from "@/lib/ga";
import { crawlers } from "@/lib/ga-bots";
import { conversions } from "@/lib/ga-attr";
import { searchQueries } from "@/lib/gsc";

export const dynamic = "force-dynamic";

// GET ?days=7|30|90 or ?from=YYYY-MM-DD&to=YYYY-MM-DD: the report. Add &extra=1 for the parts that come from elsewhere (crawlers, conversions, Search Console), which fail on their own. ?live=1: who is on the site now.
export async function GET(req: Request) {
  if (!(await editingAllowed("webmaster", "read"))) return new NextResponse("not found", { status: 404 });
  const q = new URL(req.url).searchParams, from = q.get("from"), to = q.get("to");
  const range: Range = from && to ? { from, to } : { days: Number(q.get("days")) };
  try {
    if (q.get("live")) return NextResponse.json(await realtime());
    if (q.get("extra")) {
      if ("from" in range ? span(range) === null : ![7, 30, 90].includes(range.days)) return new NextResponse("bad range", { status: 400 });
      const [a, b] = bounds(range), day = (d: Date) => d.toISOString().slice(0, 10);
      const [bots, conv, gsc] = await Promise.allSettled([crawlers(a, b), conversions(a, b), searchQueries(day(a), day(new Date(+b - 1)))]);
      return NextResponse.json({ bots: bots.status === "fulfilled" ? bots.value : [], conversions: conv.status === "fulfilled" ? conv.value : [], search: gsc.status === "fulfilled" ? gsc.value : { ok: false, reason: "failed", hide: true } });
    }
    return NextResponse.json(await report(range));
  } catch (e: any) { return new NextResponse(errMsg(e), { status: 502 }); }
}
