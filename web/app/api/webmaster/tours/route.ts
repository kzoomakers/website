import { NextResponse } from "next/server";
import { errMsg } from "@/lib/errmsg";
import { actor, editingAllowed } from "@/lib/guard";
import { logAudit } from "@/lib/store";
import { baseUrl } from "@/lib/mail";
import { me } from "@/lib/guard";
import * as t from "@/lib/tours";
import * as n from "@/lib/tours-notify";
import { activateWalkup } from "@/lib/approvals";

// Tours admin RPC: POST { op, ...args }. Reads need Tours view access, everything else Tours edit access.
export const dynamic = "force-dynamic";
const READS = new Set(["blocks", "bookings", "requests", "thread", "notifyGet", "calendar", "timeline", "stats"]);

export async function POST(req: Request) {
  const a = await req.json().catch(() => null);
  if (!a?.op) return new NextResponse("bad request", { status: 400 });
  if (!(await editingAllowed("tours", READS.has(a.op) ? "read" : "write"))) return new NextResponse("not found", { status: 404 });
  const who = await actor(), id = Number(a.id);
  try {
    switch (a.op) {
      case "blocks": return NextResponse.json(await t.listBlocks(!!a.past));
      case "bookings": return NextResponse.json(await t.listBookings(!!a.past));
      case "requests": return NextResponse.json(await t.listRequests(!!a.all));
      case "calendar": return NextResponse.json(await t.calendar(String(a.from), String(a.to)));
      case "stats": return NextResponse.json(await t.stats(Number(a.days) || 0));
      case "timeline": return NextResponse.json(await t.timeline({ before: Number(a.before) || undefined, groups: Array.isArray(a.groups) ? a.groups.map(String) : [], q: typeof a.q === "string" ? a.q : "" }));
      case "notifyGet": return NextResponse.json(await n.overview());
      case "emailAdd": await n.addEmail(a.event, a.email); break;
      case "emailRemove": await n.removeEmail(a.event, a.email); break;
      case "staleSave": await n.setStaleDays(a.days); break;
      case "subAdd": await n.subscribe(a.event, a.topic); break;
      case "subRemove": await n.unsubscribe(a.event, a.topic); break;
      case "import": return NextResponse.json(await t.importRequests(a.csv));
      case "offer": await t.offerTimes(id, a.offers, { name: String(a.guide_name ?? ""), email: String(a.guide_email ?? "") }, await baseUrl(req)); break;
      case "activate": { // approves a member, so it needs CRM write too
        if (!(await editingAllowed("crm", "write"))) return new NextResponse("Activating someone approves them as a member, which needs CRM access.", { status: 403 });
        const base = await baseUrl(req), r = await activateWalkup(id, who, base);
        await t.setRequestStatus(id, "closed");
        await t.postStaff("request", id, `Activated as a member on site by ${who}.`, true, who, base).catch(() => {});
        await logAudit(who, "tour.activate", String(id));
        return NextResponse.json(r);
      }
      case "reopen": case "close": await t.setRequestStatus(id, a.op === "close" ? "closed" : "open"); break;
      case "saveBlock": await t.saveBlock(a.block ?? {}, who); break;
      case "deleteBlocks": { const r = await t.deleteBlocks(a.ids, await baseUrl(req)); await logAudit(who, "tour.deleteBlocks", `${r.blocks} blocks, ${r.people} people`); return NextResponse.json(r); }
      case "thread": return NextResponse.json(await t.thread(String(a.kind), id));
      case "post": { const m = await me(); await t.postStaff(String(a.kind), id, String(a.body ?? ""), !!a.internal, m?.name || who, await baseUrl(req)); break; }
      case "setStatus": await t.setStatus(id, String(a.status)); break;
      case "cancel": await t.cancelBooking(id); break;
      default: return new NextResponse("unknown op", { status: 400 });
    }
    await logAudit(who, "tour." + a.op, String(a.block?.date ?? a.id ?? ""));
    return NextResponse.json({ ok: true });
  } catch (e: any) { return new NextResponse(errMsg(e), { status: 400 }); }
}
