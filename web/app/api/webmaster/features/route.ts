import { NextResponse } from "next/server";
import { errMsg } from "@/lib/errmsg";
import { features, saveFeatures } from "@/lib/features";
import { actor, editingAllowed } from "@/lib/guard";
import { logAudit } from "@/lib/store";

// Which member workflows are on (classes, online tests). Admin section. POST { classes?: boolean, tests?: boolean }.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const a = await req.json().catch(() => null);
  if (!(await editingAllowed("system", "write", "workflows"))) return new NextResponse("not found", { status: 404 });
  try {
    await saveFeatures(a ?? {}, await actor(), logAudit);
    return NextResponse.json(await features());
  } catch (e: any) { return new NextResponse(errMsg(e), { status: 400 }); }
}
