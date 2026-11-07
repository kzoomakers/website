import { NextResponse } from "next/server";
import { getMenu, menuHistory, revertMenu, saveMenu } from "@/lib/store";
import { actor, editingAllowed } from "@/lib/guard";

const ok = (m: any, d = 0): boolean =>
  Array.isArray(m) && d < 4 && m.every((i) => typeof i?.label === "string" && (i.href === undefined || typeof i.href === "string") && (i.items === undefined || ok(i.items, d + 1)));

export async function GET(req: Request) {
  if (!(await editingAllowed())) return new NextResponse("not found", { status: 404 });
  if (new URL(req.url).searchParams.has("history")) return NextResponse.json(await menuHistory());
  return NextResponse.json(await getMenu());
}

export async function PUT(req: Request) {
  if (!(await editingAllowed())) return new NextResponse("not found", { status: 404 });
  const menu = await req.json();
  if (!ok(menu)) return new NextResponse("bad menu", { status: 400 });
  await saveMenu(menu, await actor());
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  if (!(await editingAllowed())) return new NextResponse("not found", { status: 404 });
  const { revert } = await req.json();
  if (!Number.isInteger(revert) || !(await revertMenu(revert, await actor()))) return new NextResponse("no such revision", { status: 404 });
  return NextResponse.json(await getMenu());
}
