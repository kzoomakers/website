import { NextResponse } from "next/server";
import { getGuided, revertSetting, saveGuided, settingHistory } from "@/lib/store";
import { cleanGuided, guidedDef } from "@/lib/guided";
import { actor, editingAllowed } from "@/lib/guard";

type Ctx = { params: Promise<{ slug: string }> };
const off = () => new NextResponse("not found", { status: 404 });
const ok = async (c: Ctx) => ((await editingAllowed()) && guidedDef((await c.params).slug) ? (await c.params).slug : null);

export async function GET(_: Request, c: Ctx) {
  const slug = await ok(c);
  return slug ? NextResponse.json(await settingHistory(`guided.${slug}`)) : off();
}

export async function PUT(req: Request, c: Ctx) {
  const slug = await ok(c);
  if (!slug) return off();
  let data;
  try { data = cleanGuided(slug, await req.json()); } catch { return new NextResponse("bad data", { status: 400 }); }
  await saveGuided(slug, data, await actor());
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request, c: Ctx) {
  const slug = await ok(c);
  if (!slug) return off();
  const { revert } = await req.json().catch(() => ({}));
  if (!Number.isInteger(revert) || !(await revertSetting(`guided.${slug}`, revert, await actor()))) return off();
  return NextResponse.json(await getGuided(slug));
}
