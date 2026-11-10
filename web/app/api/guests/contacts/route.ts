import { NextResponse } from "next/server";
import { errMsg } from "@/lib/errmsg";
import { access, isRes } from "@/lib/guest-access";
import * as G from "@/lib/guests";

export const dynamic = "force-dynamic";

// Same shape as /api/account for emergency contacts, so the member wizard's step is reused as is. ?g=<id> (host) or ?t=<token> (guest).
export async function GET(req: Request) { const a = await access(req); return isRes(a) ? a : NextResponse.json({ contacts: await G.listContacts(a.g.id) }); }
export async function POST(req: Request) {
  const b = await req.json().catch(() => null), a = await access(req, b);
  if (isRes(a)) return a;
  try { await G.addContact(a.g.id, b ?? {}); return NextResponse.json(await G.listContacts(a.g.id)); } catch (e: any) { return new NextResponse(errMsg(e), { status: 400 }); }
}
export async function DELETE(req: Request) {
  const a = await access(req);
  if (isRes(a)) return a;
  await G.deleteContact(a.g.id, Number(new URL(req.url).searchParams.get("contact")));
  return NextResponse.json(await G.listContacts(a.g.id));
}
