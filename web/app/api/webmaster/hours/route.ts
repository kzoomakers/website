import { NextResponse } from "next/server";
import { getHours, revertSetting, saveHours, settingHistory } from "@/lib/store";
import { actor, editingAllowed } from "@/lib/guard";
import { buildHours, validHours } from "@/lib/hours";

export async function PUT(req: Request) {
  if (!(await editingAllowed("webmaster"))) return new NextResponse("not found", { status: 404 });
  const f = await req.json().catch(() => null);
  const h = buildHours(await getHours(), { openDays: f?.openDays ?? [], openTime: f?.openTime, closeTime: f?.closeTime, closedMessage: f?.closedMessage, closedMessageToday: f?.closedMessageToday, address: f?.address });
  if (!validHours({ ...h.schedule, address: h.contact.address })) return new NextResponse("Times must look like 10:00 AM, and the address can't be empty", { status: 400 });
  await saveHours(h, await actor());
  return NextResponse.json({ ok: true });
}

export async function GET() {
  if (!(await editingAllowed("webmaster", "read"))) return new NextResponse("not found", { status: 404 });
  return NextResponse.json(await settingHistory("hours"));
}

export async function POST(req: Request) {
  if (!(await editingAllowed("webmaster"))) return new NextResponse("not found", { status: 404 });
  const { revert } = await req.json().catch(() => ({}));
  if (!Number.isInteger(revert) || !(await revertSetting("hours", revert, await actor()))) return new NextResponse("no such revision", { status: 404 });
  return NextResponse.json(await getHours());
}
