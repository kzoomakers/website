import { NextResponse } from "next/server";
import { actor, editingAllowed } from "@/lib/guard";
import { logAudit } from "@/lib/store";
import * as t from "@/lib/tours";

// Tours admin RPC: POST { op, ...args }. Reads need Tours view access, everything else Tours edit access.
export const dynamic = "force-dynamic";
const READS = new Set(["blocks", "bookings"]);

export async function POST(req: Request) {
  const a = await req.json().catch(() => null);
  if (!a?.op) return new NextResponse("bad request", { status: 400 });
  if (!(await editingAllowed("tours", READS.has(a.op) ? "read" : "write"))) return new NextResponse("not found", { status: 404 });
  const who = await actor(), id = Number(a.id);
  try {
    switch (a.op) {
      case "blocks": return NextResponse.json(await t.listBlocks(!!a.past));
      case "bookings": return NextResponse.json(await t.listBookings(!!a.past));
      case "saveBlock": await t.saveBlock(a.block ?? {}, who); break;
      case "deleteBlock": await t.deleteBlock(id); break;
      case "setStatus": await t.setStatus(id, String(a.status)); break;
      case "setNotes": await t.setNotes(id, String(a.notes ?? "")); break;
      case "cancel": await t.cancelBooking(id); break;
      default: return new NextResponse("unknown op", { status: 400 });
    }
    await logAudit(who, "tour." + a.op, String(a.block?.date ?? a.id ?? ""));
    return NextResponse.json({ ok: true });
  } catch (e: any) { return new NextResponse(e.message ?? "failed", { status: 400 }); }
}
