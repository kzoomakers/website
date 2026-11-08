import { NextResponse } from "next/server";
import { revertSetting, settingHistory } from "@/lib/store";
import { getSecHeaders, saveSecHeaders } from "@/lib/sechead-store";
import { actor, editingAllowed } from "@/lib/guard";

export async function PUT(req: Request) {
  if (!(await editingAllowed("admin"))) return new NextResponse("not found", { status: 404 });
  const b = await req.json().catch(() => null);
  if (!b || typeof b !== "object") return new NextResponse("bad request", { status: 400 });
  return NextResponse.json(await saveSecHeaders(b, await actor())); // normalize() inside clamps and drops anything invalid
}

export async function GET() {
  if (!(await editingAllowed("admin", "read"))) return new NextResponse("not found", { status: 404 });
  return NextResponse.json(await settingHistory("security"));
}

export async function POST(req: Request) {
  if (!(await editingAllowed("admin"))) return new NextResponse("not found", { status: 404 });
  const { revert } = await req.json().catch(() => ({}));
  if (!Number.isInteger(revert) || !(await revertSetting("security", revert, await actor()))) return new NextResponse("no such revision", { status: 404 });
  return NextResponse.json(await getSecHeaders());
}
