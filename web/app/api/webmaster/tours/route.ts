import { NextResponse } from "next/server";
import { errMsg } from "@/lib/errmsg";
import { actor, editingAllowed } from "@/lib/guard";
import { logAudit } from "@/lib/store";
import { baseUrl } from "@/lib/mail";
import { me } from "@/lib/guard";
import * as t from "@/lib/tours";
import * as n from "@/lib/tours-notify";
import { activateTourPerson, undoActivation } from "@/lib/approvals";
import { isStaffEmail } from "@/lib/tours-fmt";

// Tours admin RPC: POST { op, ...args }. Reads need Tours view access, everything else Tours edit access.
export const dynamic = "force-dynamic";
const READS = new Set(["blocks", "bookings", "requests", "exportRequests", "exportBlocks", "exportBookings", "thread", "notifyGet", "calendar", "timeline", "stats"]);
// The admin page each op belongs to (see lib/access.ts), so a person given just that page can use it. An op not listed here needs a whole-section grant.
const PAGE: Record<string, string | string[]> = {
  blocks: ["availability", "bookings"], saveBlock: "availability", deleteBlocks: "availability", exportBlocks: "availability", importBlocks: "availability", calendar: "*",
  bookings: "bookings", cancel: "bookings", setStatus: "bookings", exportBookings: "bookings", importBookings: "bookings",
  requests: "walkups", offer: "walkups", reopen: "walkups", close: "walkups", exportRequests: "walkups", import: "walkups", thread: ["bookings", "walkups"], post: ["bookings", "walkups"],
  stats: "stats", timeline: "timeline",
  notifyGet: "notifications", emailAdd: "notifications", emailRemove: "notifications", staleSave: "notifications", subAdd: "notifications", subRemove: "notifications",
  activate: ["bookings", "walkups"], undoActivation: ["bookings", "walkups"],
};

export async function POST(req: Request) {
  const a = await req.json().catch(() => null);
  if (!a?.op) return new NextResponse("bad request", { status: 400 });
  if (!(await editingAllowed("tours", READS.has(a.op) ? "read" : "write", PAGE[a.op]))) return new NextResponse("not found", { status: 404 });
  const who = await actor(), id = Number(a.id);
  try {
    switch (a.op) {
      case "blocks": return NextResponse.json(await t.listBlocks(!!a.past));
      case "bookings": return NextResponse.json(await t.listBookings(!!a.past));
      case "requests": return NextResponse.json(await t.listRequests(!!a.all));
      case "calendar": return NextResponse.json(await t.calendar(String(a.from), String(a.to)));
      case "stats": return NextResponse.json(await t.stats(Number(a.days) || 0, typeof a.guide === "string" ? a.guide.slice(0, 200) : ""));
      case "timeline": return NextResponse.json(await t.timeline({ before: Number(a.before) || undefined, groups: Array.isArray(a.groups) ? a.groups.map(String) : [], q: typeof a.q === "string" ? a.q : "" }));
      case "notifyGet": return NextResponse.json(await n.overview());
      case "emailAdd": await n.addEmail(a.event, a.email); break;
      case "emailRemove": await n.removeEmail(a.event, a.email); break;
      case "staleSave": await n.setStaleDays(a.days); break;
      case "subAdd": await n.subscribe(a.event, a.topic); break;
      case "subRemove": await n.unsubscribe(a.event, a.topic); break;
      case "exportRequests": return NextResponse.json({ csv: await t.exportRequests(!!a.all) });
      case "import": return NextResponse.json(await t.importRequests(a.csv));
      case "exportBlocks": return NextResponse.json({ csv: await t.exportBlocks(!!a.past) });
      case "importBlocks": return NextResponse.json(await t.importBlocks(a.csv, who));
      case "exportBookings": return NextResponse.json({ csv: await t.exportBookings(!!a.past) });
      case "importBookings": return NextResponse.json(await t.importBookings(a.csv));
      case "offer": await t.offerTimes(id, a.offers, { name: String(a.guide_name ?? ""), email: String(a.guide_email ?? "") }, await baseUrl(req)); break;
      case "activate": case "undoActivation": { // both change a member's account, so they need CRM write too
        if (!(await editingAllowed("crm", "write", ["people", "approvals"]))) return new NextResponse("Activating or undoing a member needs CRM access.", { status: 403 });
        const kind = a.kind === "booking" ? "booking" : "request", base = await baseUrl(req);
        if (a.op === "activate") {
          const r = await activateTourPerson(kind, id, who, base, String(a.level ?? ""), typeof a.email === "string" ? a.email : undefined);
          await (kind === "request" ? t.setRequestStatus(id, "closed") : t.setStatus(id, "signed_up"));
          await t.postStaff(kind, id, `Activated as a member on site by ${who}.`, true, who, base).catch(() => {});
          await logAudit(who, "tour.activate", `${kind} ${id}`);
          return NextResponse.json(r);
        }
        const r = await undoActivation(kind, id, who, { confirm: !!a.confirm, staff: isStaffEmail(who), check: !!a.check });
        if (!r.done) return NextResponse.json(r);
        await (kind === "request" ? t.setRequestStatus(id, "open") : t.setStatus(id, "booked"));
        await t.postStaff(kind, id, `Activation undone by ${who}${a.confirm ? " (account reset, signed agreement deleted)" : ""}.`, true, who, base).catch(() => {});
        await logAudit(who, "tour.undoActivation", `${kind} ${id}`);
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
