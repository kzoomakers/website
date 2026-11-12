import { NextResponse } from "next/server";
import { errMsg } from "@/lib/errmsg";
import { actor, editingAllowed } from "@/lib/guard";
import { membershipClasses, saveMembershipClasses } from "@/lib/membership";

// The membership classes and their fees. Admin section. POST { classes: [{ name, price, per }] }.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const a = await req.json().catch(() => null);
  if (!(await editingAllowed("admin", "write"))) return new NextResponse("not found", { status: 404 });
  try {
    await saveMembershipClasses(a?.classes, await actor());
    return NextResponse.json(await membershipClasses());
  } catch (e: any) { return new NextResponse(errMsg(e), { status: 400 }); }
}
