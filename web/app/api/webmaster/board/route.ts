import { NextResponse } from "next/server";
import { revertSetting, saveBoard, settingHistory, getBoard } from "@/lib/store";
import { actor, editingAllowed } from "@/lib/guard";

const s = (v: unknown) => typeof v === "string";

export async function PUT(req: Request) {
  if (!(await editingAllowed())) return new NextResponse("not found", { status: 404 });
  const b = await req.json().catch(() => null);
  if (!s(b?.title) || !s(b?.intro) || !Array.isArray(b?.members) || !b.members.every((m: any) => s(m?.name) && s(m?.role) && s(m?.bio) && s(m?.photo)))
    return new NextResponse("bad board", { status: 400 });
  await saveBoard({ title: b.title, intro: b.intro, members: b.members.map(({ name, role, bio, photo }: any) => ({ name, role, bio, photo })) }, await actor());
  return NextResponse.json({ ok: true });
}

export async function GET() {
  if (!(await editingAllowed())) return new NextResponse("not found", { status: 404 });
  return NextResponse.json(await settingHistory("board"));
}

export async function POST(req: Request) {
  if (!(await editingAllowed())) return new NextResponse("not found", { status: 404 });
  const { revert } = await req.json().catch(() => ({}));
  if (!Number.isInteger(revert) || !(await revertSetting("board", revert, await actor()))) return new NextResponse("no such revision", { status: 404 });
  return NextResponse.json(await getBoard());
}
