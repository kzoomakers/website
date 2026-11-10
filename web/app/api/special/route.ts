import { NextResponse } from "next/server";
import { errMsg } from "@/lib/errmsg";
import { actor, editingAllowed } from "@/lib/guard";
import { setSpecial, specialList } from "@/lib/waiver";

export const dynamic = "force-dynamic";

// Special permissions (who may publish an agreement). Changing them needs full Admin access.
export async function POST(req: Request) {
  if (!(await editingAllowed("admin"))) return new NextResponse("not found", { status: 404 });
  const a = await req.json().catch(() => null);
  try { await setSpecial(String(a?.perm ?? ""), String(a?.email ?? ""), a?.on === true, await actor()); return NextResponse.json(await specialList()); }
  catch (e: any) { return new NextResponse(errMsg(e), { status: 400 }); }
}
