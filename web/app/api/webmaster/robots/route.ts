import { NextResponse } from "next/server";
import { getRobots, revertSetting, saveRobots, settingHistory } from "@/lib/store";
import { actor, editingAllowed } from "@/lib/guard";

export async function PUT(req: Request) {
  if (!(await editingAllowed())) return new NextResponse("not found", { status: 404 });
  const b = await req.json().catch(() => null);
  if (typeof b?.text !== "string" || b.text.length > 20000) return new NextResponse("bad robots.txt", { status: 400 });
  await saveRobots(b.text, await actor());
  return NextResponse.json({ ok: true });
}

export async function GET() {
  if (!(await editingAllowed())) return new NextResponse("not found", { status: 404 });
  return NextResponse.json(await settingHistory("robots"));
}

export async function POST(req: Request) {
  if (!(await editingAllowed())) return new NextResponse("not found", { status: 404 });
  const { revert } = await req.json().catch(() => ({}));
  if (!Number.isInteger(revert) || !(await revertSetting("robots", revert, await actor()))) return new NextResponse("no such revision", { status: 404 });
  return NextResponse.json({ text: await getRobots() });
}
