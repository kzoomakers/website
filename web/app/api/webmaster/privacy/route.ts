import { NextResponse } from "next/server";
import { getPrivacy, revertSetting, savePrivacy, settingHistory } from "@/lib/store";
import { actor, editingAllowed } from "@/lib/guard";

export async function PUT(req: Request) {
  if (!(await editingAllowed("admin"))) return new NextResponse("not found", { status: 404 });
  const b = await req.json().catch(() => null);
  if (typeof b?.text !== "string" || b.text.length > 20000) return new NextResponse("bad privacy statement", { status: 400 });
  await savePrivacy(b.text, await actor());
  return NextResponse.json({ ok: true });
}

export async function GET() {
  if (!(await editingAllowed("admin", "read"))) return new NextResponse("not found", { status: 404 });
  return NextResponse.json(await settingHistory("privacy"));
}

export async function POST(req: Request) {
  if (!(await editingAllowed("admin"))) return new NextResponse("not found", { status: 404 });
  const { revert } = await req.json().catch(() => ({}));
  if (!Number.isInteger(revert) || !(await revertSetting("privacy", revert, await actor()))) return new NextResponse("no such revision", { status: 404 });
  return NextResponse.json({ text: await getPrivacy() });
}
